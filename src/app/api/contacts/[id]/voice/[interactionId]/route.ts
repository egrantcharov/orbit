/**
 * GET /api/contacts/[id]/voice/[interactionId]
 *   Mints a 60-second signed URL the browser can use to stream the audio.
 *   Bucket is private; URLs are minted fresh on every play to keep audit
 *   surface tight.
 *
 * DELETE /api/contacts/[id]/voice/[interactionId]
 *   Removes the storage object AND the interactions row.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { isUuid } from "@/lib/security/input";

const SIGNED_URL_TTL_SECONDS = 60;

async function loadRow(
  userId: string,
  contactId: string,
  interactionId: string,
) {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("interactions")
    .select("id, kind, audio_path, audio_mime, audio_duration_ms")
    .eq("clerk_user_id", userId)
    .eq("contact_id", contactId)
    .eq("id", interactionId)
    .maybeSingle();
  return { supabase, row: data };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; interactionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, interactionId } = await ctx.params;
  if (!isUuid(id) || !isUuid(interactionId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const { supabase, row } = await loadRow(userId, id, interactionId);
  if (!row || !row.audio_path) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { data: signed, error } = await supabase.storage
    .from("voice-memos")
    .createSignedUrl(row.audio_path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed?.signedUrl) {
    console.error("voice sign failed", { userId, msg: error?.message });
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    url: signed.signedUrl,
    mime: row.audio_mime,
    duration_ms: row.audio_duration_ms,
    expires_in: SIGNED_URL_TTL_SECONDS,
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; interactionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, interactionId } = await ctx.params;
  if (!isUuid(id) || !isUuid(interactionId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const { supabase, row } = await loadRow(userId, id, interactionId);
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (row.audio_path) {
    await supabase.storage.from("voice-memos").remove([row.audio_path]);
  }
  const { error } = await supabase
    .from("interactions")
    .delete()
    .eq("clerk_user_id", userId)
    .eq("id", row.id);
  if (error) {
    console.error("voice delete failed", { userId, code: error.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
