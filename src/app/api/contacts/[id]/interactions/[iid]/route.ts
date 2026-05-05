import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; iid: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, iid } = await ctx.params;
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("interactions")
    .delete()
    .eq("clerk_user_id", userId)
    .eq("contact_id", id)
    .eq("id", iid);
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
