/**
 * POST /api/contacts/[id]/voice
 *
 * Multipart upload: accepts an audio Blob plus an optional transcript and
 * persists both — the file lands in the private `voice-memos` bucket, and a
 * matching `interactions` row (kind=voice_memo) gets created so the activity
 * timeline picks it up automatically.
 *
 * Defense in depth on inputs:
 *   - Clerk gates the route (proxy).
 *   - User must own the contact (lookup by clerk_user_id).
 *   - Audio size capped server-side at 20 MB.
 *   - MIME type restricted to a small allow-list.
 *   - Duration capped at 30 minutes.
 *   - Transcript capped at 50k chars (long calls + light overhead).
 *
 * Storage path: `<userId>/<contactId>/<uuid>.<ext>` so a future per-user
 * cleanup ("disconnect Google + erase voice memos") is one prefix delete.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { isUuid, rateLimitResponse } from "@/lib/security/input";

export const maxDuration = 60;
export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_DURATION_MS = 30 * 60 * 1000; // 30 min
const MAX_TRANSCRIPT_CHARS = 50_000;
const UPLOAD_LIMIT_PER_HOUR = 60;

const ALLOWED_MIME: ReadonlyArray<string> = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
];

function extensionFor(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime === "audio/mp4") return "m4a";
  if (mime === "audio/mpeg") return "mp3";
  if (mime.startsWith("audio/wav") || mime === "audio/x-wav") return "wav";
  return "bin";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: contactId } = await ctx.params;
  if (!isUuid(contactId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const rl = checkRateLimit(`voice:${userId}`, UPLOAD_LIMIT_PER_HOUR, 3_600_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const ctype = req.headers.get("content-type") ?? "";
  if (!ctype.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "expected_multipart" }, { status: 415 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "missing_audio" }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: "empty_audio" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
  }

  const mime = (audio.type || "audio/webm").toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) {
    return NextResponse.json(
      { error: "unsupported_mime", mime },
      { status: 415 },
    );
  }

  const durationRaw = form.get("duration_ms");
  let durationMs: number | null = null;
  if (typeof durationRaw === "string") {
    const n = Number.parseInt(durationRaw, 10);
    if (Number.isFinite(n) && n > 0) {
      if (n > MAX_DURATION_MS) {
        return NextResponse.json({ error: "audio_too_long" }, { status: 413 });
      }
      durationMs = n;
    }
  }

  const transcriptRaw = form.get("transcript");
  let transcript: string | null = null;
  if (typeof transcriptRaw === "string") {
    const t = transcriptRaw.trim();
    if (t) transcript = t.slice(0, MAX_TRANSCRIPT_CHARS);
  }

  const titleRaw = form.get("title");
  const title =
    typeof titleRaw === "string" && titleRaw.trim()
      ? titleRaw.trim().slice(0, 200)
      : null;

  const supabase = createSupabaseServiceClient();

  // Ownership check: the contact must belong to this user.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ext = extensionFor(mime);
  const storageKey = `${userId}/${contactId}/${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await audio.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("voice-memos")
    .upload(storageKey, buffer, {
      contentType: mime,
      upsert: false,
      cacheControl: "private, max-age=0, no-store",
    });
  if (upErr) {
    console.error("voice upload failed", {
      userId,
      contactId,
      msg: upErr.message,
    });
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  const occurredAt = new Date().toISOString();
  const { data: row, error: insErr } = await supabase
    .from("interactions")
    .insert({
      clerk_user_id: userId,
      contact_id: contact.id,
      kind: "voice_memo",
      occurred_at: occurredAt,
      title,
      body: transcript,
      audio_path: storageKey,
      audio_duration_ms: durationMs,
      audio_mime: mime,
    })
    .select(
      "id, kind, occurred_at, title, body, audio_path, audio_duration_ms, audio_mime",
    )
    .maybeSingle();

  if (insErr || !row) {
    // Try to clean up the orphaned object so storage doesn't drift.
    await supabase.storage.from("voice-memos").remove([storageKey]).catch(() => {});
    console.error("voice interaction insert failed", {
      userId,
      code: insErr?.code,
    });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Keep contact recency in sync when this is the newest signal.
  await supabase
    .from("contacts")
    .update({ last_interaction_at: occurredAt })
    .eq("clerk_user_id", userId)
    .eq("id", contact.id)
    .lt("last_interaction_at", occurredAt);

  return NextResponse.json({ ok: true, interaction: row });
}
