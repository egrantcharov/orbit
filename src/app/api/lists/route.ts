import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { resolveListFilter } from "@/lib/lists/resolve";
import type { ListFilter } from "@/lib/types/database";

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function asStringArray(v: unknown, max = 50): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 80))
    .slice(0, max);
  return out;
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
    out.days_since_interaction_gte = Math.max(0, Math.round(r.days_since_interaction_gte));
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

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();
  const { data: lists } = await supabase
    .from("lists")
    .select("id, name, description, filter, stages, created_at, updated_at")
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false });

  // Compute counts per list (filter-resolved + manually-added members).
  const out = await Promise.all(
    (lists ?? []).map(async (l) => {
      const resolved = await resolveListFilter({
        clerkUserId: userId,
        filter: (l.filter as ListFilter) ?? {},
        limit: 1000,
      });
      const { data: manual } = await supabase
        .from("list_contacts")
        .select("contact_id")
        .eq("list_id", l.id);
      const ids = new Set(resolved.map((c) => c.id));
      for (const m of manual ?? []) ids.add(m.contact_id);
      return { ...l, count: ids.size };
    }),
  );
  return NextResponse.json({ ok: true, lists: out });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = clean(body.name);
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }
  const description = clean(body.description, 500);
  const filter = sanitizeFilter(body.filter);
  const stages = asStringArray(body.stages, 10);

  const supabase = createSupabaseServiceClient();
  await supabase
    .from("app_users")
    .upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id" });

  const { data, error } = await supabase
    .from("lists")
    .insert({
      clerk_user_id: userId,
      name,
      description,
      filter,
      stages: stages && stages.length > 0 ? stages : null,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("list create failed", { userId, code: error?.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
