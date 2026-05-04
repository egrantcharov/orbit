import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Returns IDs of contacts eligible for enrichment: visible, has email,
// not currently in 'running' state. Caller chunks them 30 at a time.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("is_archived", false)
    .not("email", "is", null)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(3000);

  return NextResponse.json({
    ok: true,
    contactIds: (contacts ?? []).map((c) => c.id),
  });
}
