import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/types/database";

type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];

export type ImportRow = {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  company?: string | null;
  job_title?: string | null;
  industry?: string | null;
  sector?: string | null;
  team?: string | null;
  school?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  birthday?: string | null; // yyyy-mm-dd
  connected_on?: string | null; // yyyy-mm-dd or any parseable date
  notes?: string | null;
};

const MAX_ROWS = 5000;

function clean(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function normalizeEmail(v: unknown): string | null {
  const s = clean(v, 320);
  if (!s) return null;
  if (!s.includes("@")) return null;
  return s.toLowerCase();
}

function normalizeBirthday(v: unknown): string | null {
  const s = clean(v, 32);
  if (!s) return null;
  // accept 2026-01-30 or 1990-01-30 or 01/30 (no year → 1900 sentinel)
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const md = s.match(/^(\d{1,2})[\/-](\d{1,2})$/);
  if (md) {
    const m = md[1].padStart(2, "0");
    const d = md[2].padStart(2, "0");
    return `1900-${m}-${d}`;
  }
  // try Date.parse fallback (LinkedIn "Jan 30, 1990")
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function buildDisplayName(row: ImportRow): string | null {
  if (row.display_name) return clean(row.display_name);
  const f = clean(row.first_name);
  const l = clean(row.last_name);
  const joined = [f, l].filter(Boolean).join(" ").trim();
  return joined || null;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { rows?: unknown };
  try {
    body = (await req.json()) as { rows?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: "invalid_rows" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: "too_many_rows" }, { status: 413 });
  }

  const supabase = createSupabaseServiceClient();

  // ensure app_user row exists (other code paths assume it).
  await supabase
    .from("app_users")
    .upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id" });

  // Pre-read existing contacts so we can fill *null* fields without
  // overwriting any user/LLM-set data.
  const { data: existing } = await supabase
    .from("contacts")
    .select(
      "id, email, linkedin_url, display_name, company, job_title, industry, location, birthday, tags, source",
    )
    .eq("clerk_user_id", userId);

  const byEmail = new Map<string, (typeof existing extends null ? never : NonNullable<typeof existing>[number])>();
  const byLinkedin = new Map<string, (typeof existing extends null ? never : NonNullable<typeof existing>[number])>();
  for (const row of existing ?? []) {
    if (row.email) byEmail.set(row.email.toLowerCase(), row);
    if (row.linkedin_url) byLinkedin.set(row.linkedin_url, row);
  }

  let created = 0;
  let enriched = 0;
  let skipped = 0;

  // Build inserts (new) and per-row updates (existing). Bulk-upsert new ones,
  // PATCH-style update existing ones individually so we never clobber data.
  const inserts: ContactInsert[] = [];
  const enrichments: Array<{ id: string; patch: Partial<ContactInsert> }> = [];

  for (const raw of body.rows as Record<string, unknown>[]) {
    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }
    const r: ImportRow = {
      email: normalizeEmail(raw.email),
      first_name: clean(raw.first_name),
      last_name: clean(raw.last_name),
      display_name: clean(raw.display_name),
      company: clean(raw.company),
      job_title: clean(raw.job_title),
      industry: clean(raw.industry),
      location: clean(raw.location),
      linkedin_url: clean(raw.linkedin_url, 500),
      birthday: normalizeBirthday(raw.birthday),
      connected_on: clean(raw.connected_on, 64),
      notes: clean(raw.notes, 4000),
    };

    const displayName = buildDisplayName(r);

    let lastInteraction: string | null = null;
    if (r.connected_on) {
      const t = Date.parse(r.connected_on);
      if (!Number.isNaN(t)) lastInteraction = new Date(t).toISOString();
    }

    const baseTags = ["linkedin"];

    if (r.email) {
      const ex = byEmail.get(r.email);
      if (ex) {
        const patch: Partial<ContactInsert> = {};
        if (!ex.display_name && displayName) patch.display_name = displayName;
        if (!ex.company && r.company) patch.company = r.company;
        if (!ex.job_title && r.job_title) patch.job_title = r.job_title;
        if (!ex.industry && r.industry) patch.industry = r.industry;
        if (!ex.location && r.location) patch.location = r.location;
        if (!ex.linkedin_url && r.linkedin_url) patch.linkedin_url = r.linkedin_url;
        if (!ex.birthday && r.birthday) patch.birthday = r.birthday;
        const tagSet = new Set([...(ex.tags ?? []), ...baseTags]);
        if (tagSet.size !== (ex.tags ?? []).length) patch.tags = Array.from(tagSet);
        if (Object.keys(patch).length > 0) {
          enrichments.push({ id: ex.id, patch });
          enriched++;
        } else {
          skipped++;
        }
        continue;
      }

      inserts.push({
        clerk_user_id: userId,
        email: r.email,
        display_name: displayName,
        kind: "person",
        kind_locked: true,
        source: "linkedin",
        company: r.company,
        job_title: r.job_title,
        industry: r.industry,
        location: r.location,
        linkedin_url: r.linkedin_url,
        birthday: r.birthday,
        tags: baseTags,
        last_interaction_at: lastInteraction,
        met_on: r.connected_on
          ? (Date.parse(r.connected_on) && !Number.isNaN(Date.parse(r.connected_on))
              ? new Date(r.connected_on).toISOString().slice(0, 10)
              : null)
          : null,
        met_via: "LinkedIn connection",
      });
      created++;
      continue;
    }

    if (r.linkedin_url) {
      const ex = byLinkedin.get(r.linkedin_url);
      if (ex) {
        const patch: Partial<ContactInsert> = {};
        if (!ex.display_name && displayName) patch.display_name = displayName;
        if (!ex.company && r.company) patch.company = r.company;
        if (!ex.job_title && r.job_title) patch.job_title = r.job_title;
        if (!ex.industry && r.industry) patch.industry = r.industry;
        if (!ex.location && r.location) patch.location = r.location;
        if (!ex.birthday && r.birthday) patch.birthday = r.birthday;
        if (Object.keys(patch).length > 0) {
          enrichments.push({ id: ex.id, patch });
          enriched++;
        } else {
          skipped++;
        }
        continue;
      }

      inserts.push({
        clerk_user_id: userId,
        email: null,
        display_name: displayName ?? r.linkedin_url,
        kind: "person",
        kind_locked: true,
        source: "linkedin",
        company: r.company,
        job_title: r.job_title,
        industry: r.industry,
        location: r.location,
        linkedin_url: r.linkedin_url,
        birthday: r.birthday,
        tags: baseTags,
        last_interaction_at: lastInteraction,
      });
      created++;
      continue;
    }

    // No email and no LinkedIn URL — can't dedupe; skip.
    skipped++;
  }

  if (inserts.length > 0) {
    // Batch in 200-row chunks to keep payloads modest.
    for (let i = 0; i < inserts.length; i += 200) {
      const slice = inserts.slice(i, i + 200);
      const { error: insErr } = await supabase.from("contacts").insert(slice);
      if (insErr) {
        console.error("import insert failed", { userId, code: insErr.code });
        return NextResponse.json({ error: "db_error" }, { status: 500 });
      }
    }
  }

  for (const e of enrichments) {
    const { error: upErr } = await supabase
      .from("contacts")
      .update(e.patch)
      .eq("clerk_user_id", userId)
      .eq("id", e.id);
    if (upErr) {
      console.error("import update failed", { userId, id: e.id, code: upErr.code });
    }
  }

  return NextResponse.json({ ok: true, created, enriched, skipped });
}
