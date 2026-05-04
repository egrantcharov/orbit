import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("mailbox_connections")
    .delete()
    .eq("clerk_user_id", userId);

  if (error) {
    console.error("Failed to disconnect Google", { userId, code: error.code });
    return NextResponse.json(
      { error: "disconnect_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
