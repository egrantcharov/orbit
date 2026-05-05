import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/types/database";

type ArticleUpdate = Database["public"]["Tables"]["articles"]["Update"];

// PATCH /api/articles/[id] — toggle is_read / is_starred.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const update: ArticleUpdate = {};
  if (typeof body.is_read === "boolean") update.is_read = body.is_read;
  if (typeof body.is_starred === "boolean") update.is_starred = body.is_starred;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("articles")
    .update(update)
    .eq("clerk_user_id", userId)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
