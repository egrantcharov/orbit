import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// POST /api/lists/[id]/contacts — add a contact to a list (manual member).
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  let body: { contact_id?: unknown; stage?: unknown };
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.contact_id !== "string" || !body.contact_id) {
    return NextResponse.json({ error: "missing_contact" }, { status: 400 });
  }
  const stage =
    typeof body.stage === "string" && body.stage.trim() ? body.stage.trim().slice(0, 80) : null;

  const supabase = createSupabaseServiceClient();
  // Confirm both the list and contact belong to this user.
  const [{ data: list }, { data: contact }] = await Promise.all([
    supabase
      .from("lists")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("id", body.contact_id)
      .maybeSingle(),
  ]);
  if (!list || !contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("list_contacts")
    .upsert(
      { list_id: list.id, contact_id: contact.id, stage },
      { onConflict: "list_id,contact_id" },
    );
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
