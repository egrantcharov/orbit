import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// PATCH /api/lists/[id]/contacts/[contactId] — set the stage on a list
// member. If the contact isn't already a manual member, this also adds
// them (so changing a filter-resolved contact's stage works).
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; contactId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, contactId } = await ctx.params;
  let body: { stage?: unknown };
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const stage =
    typeof body.stage === "string" && body.stage.trim()
      ? body.stage.trim().slice(0, 80)
      : null;

  const supabase = createSupabaseServiceClient();
  // Verify ownership of both ends.
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
      .eq("id", contactId)
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

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; contactId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id, contactId } = await ctx.params;
  const supabase = createSupabaseServiceClient();
  // Authorize via list ownership; cascade-protected by RLS too.
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (!list) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { error } = await supabase
    .from("list_contacts")
    .delete()
    .eq("list_id", list.id)
    .eq("contact_id", contactId);
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
