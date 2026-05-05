import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("enrichment_state")
    .select("status, threads_found, last_run_at, error_message")
    .eq("clerk_user_id", userId)
    .eq("contact_id", id)
    .order("last_run_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ ok: true, ...(data ?? {}) });
}
