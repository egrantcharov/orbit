import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { syncRecentMessages } from "@/lib/gmail/sync";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { hasAllScopes } from "@/lib/google/scopes";

export const maxDuration = 60;

const MIN_SYNC_INTERVAL_MS = 30_000; // 30s — guard against accidental double-clicks
                                      // and abusive client loops.

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: connection, error: connErr } = await supabase
    .from("google_connections")
    .select("last_sync_at, scopes")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (connErr) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!connection) {
    return NextResponse.json({ error: "no_connection" }, { status: 409 });
  }
  if (!hasAllScopes(connection.scopes)) {
    return NextResponse.json(
      {
        error:
          "Reconnect Google to upgrade scopes (the v2 sync needs Gmail read access).",
      },
      { status: 400 },
    );
  }

  if (connection.last_sync_at) {
    const ageMs = Date.now() - new Date(connection.last_sync_at).getTime();
    if (ageMs < MIN_SYNC_INTERVAL_MS) {
      const retryAfter = Math.ceil((MIN_SYNC_INTERVAL_MS - ageMs) / 1000);
      return NextResponse.json(
        {
          error: `Synced just now — try again in ${retryAfter}s.`,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  try {
    const result = await syncRecentMessages(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Sync failed", {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.message
            ? err.message
            : "Sync failed. Try reconnecting Google.",
      },
      { status: 500 },
    );
  }
}
