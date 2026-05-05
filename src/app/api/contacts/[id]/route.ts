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

function asNullableTrimmedString(v: unknown, max = 1000): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t.length === 0) return null;
  return t.slice(0, max);
}

function asTagArray(v: unknown): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const t of v) {
    if (typeof t !== "string") continue;
    const cleaned = t.trim().toLowerCase().slice(0, 40);
    if (cleaned.length > 0 && !out.includes(cleaned)) out.push(cleaned);
    if (out.length >= 24) break;
  }
  return out;
}

function asISODate(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  // accept yyyy-mm-dd
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return v;
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
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
  if (body.is_archived !== undefined) {
    if (typeof body.is_archived !== "boolean") {
      return NextResponse.json({ error: "invalid_archived" }, { status: 400 });
    }
    update.is_archived = body.is_archived;
  }
  // accept legacy { is_hidden } shape transitionally
  if (body.is_hidden !== undefined && body.is_archived === undefined) {
    if (typeof body.is_hidden !== "boolean") {
      return NextResponse.json({ error: "invalid_archived" }, { status: 400 });
    }
    update.is_archived = body.is_hidden;
  }

  for (const field of [
    "company",
    "job_title",
    "industry",
    "location",
    "linkedin_url",
    "notes",
    "met_at",
    "met_via",
    "interests",
  ] as const) {
    if (body[field] !== undefined) {
      const longField = field === "notes" || field === "interests";
      const v = asNullableTrimmedString(body[field], longField ? 4000 : 200);
      if (v !== undefined) update[field] = v;
    }
  }

  if (body.met_on !== undefined) {
    const v = asISODate(body.met_on);
    if (v === undefined && body.met_on !== null) {
      return NextResponse.json({ error: "invalid_met_on" }, { status: 400 });
    }
    update.met_on = v ?? null;
  }

  if (body.birthday !== undefined) {
    const v = asISODate(body.birthday);
    if (v === undefined && body.birthday !== null) {
      return NextResponse.json({ error: "invalid_birthday" }, { status: 400 });
    }
    update.birthday = v ?? null;
  }

  if (body.tags !== undefined) {
    const v = asTagArray(body.tags);
    if (v === undefined) {
      return NextResponse.json({ error: "invalid_tags" }, { status: 400 });
    }
    update.tags = v;
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
    .select(
      "id, is_pinned, is_archived, company, job_title, industry, location, birthday, linkedin_url, tags, notes, met_at, met_on, met_via, interests",
    )
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
