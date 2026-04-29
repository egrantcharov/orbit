import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  CONTACT_KINDS,
  type ContactKind,
  type Database,
} from "@/lib/types/database";

type ContactUpdate = Database["public"]["Tables"]["contacts"]["Update"];

function isContactKind(v: unknown): v is ContactKind {
  return typeof v === "string" && (CONTACT_KINDS as string[]).includes(v);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: { kind?: unknown; is_pinned?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const update: ContactUpdate = {};
  if (body.kind !== undefined) {
    if (!isContactKind(body.kind)) {
      return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
    }
    update.kind = body.kind;
    update.kind_reason = "manual override";
    update.kind_locked = true;
  }
  if (body.is_pinned !== undefined) {
    if (typeof body.is_pinned !== "boolean") {
      return NextResponse.json({ error: "invalid_pin" }, { status: 400 });
    }
    update.is_pinned = body.is_pinned;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("contacts")
    .update(update)
    .eq("clerk_user_id", userId)
    .eq("id", id)
    .select("id, kind, kind_locked, is_pinned")
    .maybeSingle();

  if (error) {
    console.error("contact PATCH failed", { userId, id, code: error.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, contact: data });
}
