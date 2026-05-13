/**
 * POST /api/me/delete
 *
 * Wipes every row Orbit holds about the calling user. Closes the "right to
 * erasure" half of SECURITY.md known-gap #6.
 *
 * Order matters:
 *   1. Voice-memo audio in Supabase Storage (the only data outside Postgres).
 *   2. Database tables — most have ON DELETE CASCADE from `app_users`, so
 *      removing the `app_users` row is sufficient for the cascading tables.
 *      But we delete in order anyway so a partial failure leaves the user in
 *      a recognizable "still has app_user but nothing else" state rather
 *      than orphaned children.
 *
 * Requires a `{ confirm: "DELETE" }` body so a fat-fingered fetch doesn't
 * nuke a real account. The Clerk session itself isn't terminated here —
 * the user can sign in again immediately and get a fresh empty Orbit.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/security/rateLimit";
import {
  isPlainObject,
  rateLimitResponse,
  readJsonBody,
} from "@/lib/security/input";

export const maxDuration = 60;

const DELETE_LIMIT_PER_WINDOW = 2;
const DELETE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(
    `delete:${userId}`,
    DELETE_LIMIT_PER_WINDOW,
    DELETE_WINDOW_MS,
  );
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const parsed = await readJsonBody(req, 1024);
  if (!parsed.ok) return parsed.response;
  if (!isPlainObject(parsed.value) || parsed.value.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "confirm_required", hint: 'POST body must be { "confirm": "DELETE" }' },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceClient();

  // 1) Wipe voice-memo audio. The Supabase JS client doesn't expose a
  //    server-side "delete by prefix" so we list then bulk-remove.
  const prefix = `${userId}/`;
  let voiceErr: string | null = null;
  try {
    // The `list` API is one level at a time; recurse through the
    // <contactId>/ subfolders to capture every object.
    const top = await supabase.storage.from("voice-memos").list(prefix, {
      limit: 1000,
    });
    const keys: string[] = [];
    for (const entry of top.data ?? []) {
      const inner = await supabase.storage
        .from("voice-memos")
        .list(`${prefix}${entry.name}`, { limit: 1000 });
      for (const obj of inner.data ?? []) {
        keys.push(`${prefix}${entry.name}/${obj.name}`);
      }
    }
    if (keys.length > 0) {
      const rm = await supabase.storage.from("voice-memos").remove(keys);
      if (rm.error) voiceErr = rm.error.message;
    }
  } catch (err) {
    voiceErr = err instanceof Error ? err.message : String(err);
  }
  if (voiceErr) {
    console.error("delete: voice cleanup failed", { userId, msg: voiceErr });
    // Keep going — leaving orphan audio is bad but blocking the user from
    // deleting their account is worse. Logged so we can sweep manually.
  }

  // 2) Tables. Most have clerk_user_id directly; thread_participants and
  //    list_contacts cascade via their parent FK so deleting the parent
  //    (threads / lists) cleans them up. We delete children before
  //    parents so the cascades aren't load-bearing.
  const counts: Record<string, number | null> = {};
  const tables = [
    "interactions",
    "threads", // cascade -> thread_participants
    "briefings",
    "bookmarks",
    "digests",
    "lists", // cascade -> list_contacts
    "articles",
    "publications",
    "enrichment_state",
    "contacts",
    "mailbox_connections",
  ] as const;

  for (const t of tables) {
    const { error, count } = await supabase
      .from(t)
      .delete({ count: "exact" })
      .eq("clerk_user_id", userId);
    if (error) {
      console.error("delete: table failed", { userId, table: t, code: error.code });
      // Don't bail — keep deleting the rest.
    }
    counts[t] = count ?? null;
  }

  // 3) Finally, drop the app_users row itself.
  const { error: userErr } = await supabase
    .from("app_users")
    .delete()
    .eq("clerk_user_id", userId);
  if (userErr) {
    console.error("delete: app_users failed", { userId, code: userErr.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: counts, voiceCleanupError: voiceErr });
}
