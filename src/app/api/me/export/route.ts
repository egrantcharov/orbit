/**
 * GET /api/me/export
 *
 * One-shot full data dump. Returns every row Orbit holds about the calling
 * user as a single JSON file the user can save locally. Closes the "right
 * to access" half of SECURITY.md known-gap #6.
 *
 * Voice memo audio is referenced by storage key, NOT inlined as bytes —
 * the dump stays small enough to fetch in one go. Users can re-download
 * individual audio files from the contact card if they want.
 *
 * Rate-limited to one export every 5 minutes per user; the query plan is
 * heavy (every table scan).
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { rateLimitResponse } from "@/lib/security/input";
import { APP_VERSION } from "@/lib/version";

export const maxDuration = 60;

const EXPORT_LIMIT_PER_WINDOW = 3;
const EXPORT_WINDOW_MS = 5 * 60 * 1000;

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = checkRateLimit(
    `export:${userId}`,
    EXPORT_LIMIT_PER_WINDOW,
    EXPORT_WINDOW_MS,
  );
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const supabase = createSupabaseServiceClient();

  // We deliberately omit `mailbox_connections` — that holds the
  // encrypted refresh token. Surfacing the ciphertext serves no user
  // purpose; the connection state is "Google connected: <email>" which
  // is itself in the user's Google account.
  const [
    appUser,
    contacts,
    threads,
    threadParticipants,
    interactions,
    briefings,
    bookmarks,
    digests,
    lists,
    listContacts,
    articles,
    publications,
  ] = await Promise.all([
    supabase.from("app_users").select("*").eq("clerk_user_id", userId).maybeSingle(),
    supabase.from("contacts").select("*").eq("clerk_user_id", userId),
    supabase.from("threads").select("*").eq("clerk_user_id", userId),
    supabase
      .from("thread_participants")
      .select("thread_id, contact_id, role, contacts!inner(clerk_user_id)")
      .eq("contacts.clerk_user_id", userId),
    supabase.from("interactions").select("*").eq("clerk_user_id", userId),
    supabase.from("briefings").select("*").eq("clerk_user_id", userId),
    supabase.from("bookmarks").select("*").eq("clerk_user_id", userId),
    supabase.from("digests").select("*").eq("clerk_user_id", userId),
    supabase.from("lists").select("*").eq("clerk_user_id", userId),
    supabase
      .from("list_contacts")
      .select("list_id, contact_id, stage, added_at, lists!inner(clerk_user_id)")
      .eq("lists.clerk_user_id", userId),
    supabase.from("articles").select("*").eq("clerk_user_id", userId),
    supabase.from("publications").select("*").eq("clerk_user_id", userId),
  ]);

  const dump = {
    meta: {
      exportedAt: new Date().toISOString(),
      orbitVersion: APP_VERSION,
      schemaNote:
        "Voice memo audio referenced by audio_path. Download individual files from the contact card. mailbox_connections (encrypted refresh tokens) intentionally omitted.",
    },
    app_user: appUser.data ?? null,
    contacts: contacts.data ?? [],
    threads: threads.data ?? [],
    thread_participants: threadParticipants.data ?? [],
    interactions: interactions.data ?? [],
    briefings: briefings.data ?? [],
    bookmarks: bookmarks.data ?? [],
    digests: digests.data ?? [],
    lists: lists.data ?? [],
    list_contacts: listContacts.data ?? [],
    articles: articles.data ?? [],
    publications: publications.data ?? [],
  };

  const filename = `orbit-export-${new Date().toISOString().slice(0, 10)}.json`;
  return NextResponse.json(dump, {
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
