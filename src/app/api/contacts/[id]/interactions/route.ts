import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { InteractionKind } from "@/lib/types/database";

const ALLOWED: InteractionKind[] = [
  "email_thread",
  "calendar_event",
  "note",
  "voice_memo",
  "phone",
  "imessage",
];

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

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
  const { data, error } = await supabase
    .from("interactions")
    .select(
      "id, kind, occurred_at, title, body, source_id, source_url, created_at",
    )
    .eq("clerk_user_id", userId)
    .eq("contact_id", id)
    .order("occurred_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, interactions: data ?? [] });
}

export async function POST(
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

  const kind = typeof body.kind === "string" ? body.kind : "note";
  if (!ALLOWED.includes(kind as InteractionKind)) {
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  }
  const text = clean(body.body, 10_000);
  const title = clean(body.title, 200);
  if (!text && !title) {
    return NextResponse.json({ error: "missing_body" }, { status: 400 });
  }
  const occurredAt =
    typeof body.occurred_at === "string" && !Number.isNaN(Date.parse(body.occurred_at))
      ? body.occurred_at
      : new Date().toISOString();

  const supabase = createSupabaseServiceClient();

  // Verify contact belongs to this user.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: row, error } = await supabase
    .from("interactions")
    .insert({
      clerk_user_id: userId,
      contact_id: contact.id,
      kind: kind as InteractionKind,
      occurred_at: occurredAt,
      title: title ?? null,
      body: text ?? null,
    })
    .select("id, kind, occurred_at, title, body")
    .maybeSingle();

  if (error) {
    console.error("interaction insert failed", { userId, code: error.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Bump the contact's last_interaction_at when this interaction is more
  // recent than the current value. Treats manual logs the same way email
  // threads bump it.
  await supabase
    .from("contacts")
    .update({ last_interaction_at: occurredAt })
    .eq("clerk_user_id", userId)
    .eq("id", contact.id)
    .lt("last_interaction_at", occurredAt);

  return NextResponse.json({ ok: true, interaction: row });
}
