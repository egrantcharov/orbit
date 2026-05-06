import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { resolveListFilter, type ResolvedContact } from "@/lib/lists/resolve";
import type { Database, ListFilter } from "@/lib/types/database";

type ListUpdate = Database["public"]["Tables"]["lists"]["Update"];

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}
function asStringArray(v: unknown, max = 50): string[] | null {
  if (!Array.isArray(v)) return null;
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 80))
    .slice(0, max);
}
function sanitizeFilter(raw: unknown): ListFilter {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: ListFilter = {};
  for (const k of [
    "industry",
    "sector",
    "company",
    "team",
    "school",
    "tags_any",
  ] as const) {
    const v = asStringArray(r[k]);
    if (v && v.length > 0) out[k] = v;
  }
  if (typeof r.is_pinned === "boolean") out.is_pinned = r.is_pinned;
  if (typeof r.days_since_interaction_gte === "number") {
    out.days_since_interaction_gte = Math.max(
      0,
      Math.round(r.days_since_interaction_gte),
    );
  }
  if (typeof r.min_keep_in_touch === "number") {
    out.min_keep_in_touch = Math.max(0, Math.min(1, r.min_keep_in_touch));
  }
  if (typeof r.min_career_relevance === "number") {
    out.min_career_relevance = Math.max(0, Math.min(1, r.min_career_relevance));
  }
  const s = clean(r.search_text, 200);
  if (s) out.search_text = s;
  return out;
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

  const { data: list } = await supabase
    .from("lists")
    .select("id, name, description, filter, stages, created_at, updated_at")
    .eq("clerk_user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (!list) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const filter = (list.filter as ListFilter) ?? {};
  const resolved = await resolveListFilter({
    clerkUserId: userId,
    filter,
    limit: 1000,
  });

  // Pull manually-added members + their stages.
  const { data: manualMembers } = await supabase
    .from("list_contacts")
    .select("contact_id, stage")
    .eq("list_id", list.id);
  const stageByContact = new Map(
    (manualMembers ?? []).map((m) => [m.contact_id, m.stage]),
  );
  const manualOnlyIds = new Set(
    (manualMembers ?? [])
      .map((m) => m.contact_id)
      .filter((cid) => !resolved.find((r) => r.id === cid)),
  );

  // Fetch the manual-only contacts so they show up in the list output.
  const { data: manualOnly } = manualOnlyIds.size
    ? await supabase
        .from("contacts")
        .select(
          "id, email, display_name, company, job_title, industry, sector, team, school, location, last_interaction_at, message_count, is_pinned, is_archived, score_keep_in_touch, score_career_relevance, tags, taxonomy_inferred, seniority",
        )
        .eq("clerk_user_id", userId)
        .in("id", Array.from(manualOnlyIds))
    : { data: [] };

  const allContacts: Array<ResolvedContact & { stage: string | null }> = [
    ...resolved,
    ...((manualOnly ?? []) as ResolvedContact[]),
  ].map((c) => ({
    ...c,
    stage: stageByContact.get(c.id) ?? null,
  }));

  return NextResponse.json({ ok: true, list, contacts: allContacts });
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
  const update: ListUpdate = {};
  if (body.name !== undefined) {
    const v = clean(body.name);
    if (!v) return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    update.name = v;
  }
  if (body.description !== undefined) {
    update.description = clean(body.description, 500);
  }
  if (body.filter !== undefined) {
    update.filter = sanitizeFilter(body.filter);
  }
  if (body.stages !== undefined) {
    const v = asStringArray(body.stages, 10);
    update.stages = v && v.length > 0 ? v : null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("lists")
    .update(update)
    .eq("clerk_user_id", userId)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("lists")
    .delete()
    .eq("clerk_user_id", userId)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
