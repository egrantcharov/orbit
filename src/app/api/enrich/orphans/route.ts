import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Returns the top N "orphan" senders — emails that appeared in enriched
// threads but haven't been adopted into the user's contact list. These are
// stored as is_archived=true stubs by the enrich/batch endpoint, so we
// surface them here for one-click adoption on /app/import.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();

  // Pull stub rows (is_archived=true, source='gmail') that aren't linked
  // to LinkedIn data — those are the auto-created participants from
  // enrichment that the user hasn't adopted yet. Order by message_count
  // (a rough co-occurrence proxy).
  const { data: orphans } = await supabase
    .from("contacts")
    .select(
      "id, email, display_name, message_count, last_interaction_at, linkedin_url",
    )
    .eq("clerk_user_id", userId)
    .eq("is_archived", true)
    .eq("source", "gmail")
    .is("linkedin_url", null)
    .not("email", "is", null)
    .order("message_count", { ascending: false, nullsFirst: false })
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(20);

  return NextResponse.json({ ok: true, orphans: orphans ?? [] });
}
