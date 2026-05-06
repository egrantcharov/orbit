import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { inferTaxonomy } from "@/lib/anthropic/taxonomy";
import type { Database } from "@/lib/types/database";

type ContactUpdate = Database["public"]["Tables"]["contacts"]["Update"];

export const maxDuration = 60;

const BATCH_SIZE = 30;
const MAX_PER_REQUEST = 200;

// POST /api/enrich/taxonomy — pulls eligible contacts (no industry yet,
// has company or job_title, taxonomy_inferred=false) and runs Claude
// inference in batches of 30. Persists results, sets taxonomy_inferred=true
// per row. Hard cap at 200 contacts per request — designed to be called
// repeatedly from a client polling loop or fire-and-forget after import.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");

  const supabase = createSupabaseServiceClient();

  let q = supabase
    .from("contacts")
    .select("id, display_name, company, job_title, industry, sector, team")
    .eq("clerk_user_id", userId)
    .eq("taxonomy_inferred", false)
    .is("industry", null)
    // Need company OR title to infer anything useful.
    .not("company", "is", null)
    .limit(MAX_PER_REQUEST);

  if (ids) {
    const list = ids.split(",").filter(Boolean).slice(0, MAX_PER_REQUEST);
    if (list.length > 0) q = q.in("id", list);
  }

  const { data: candidates } = await q;
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let updated = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    let results;
    try {
      results = await inferTaxonomy(batch);
    } catch (err) {
      console.error("taxonomy batch failed", {
        userId,
        batchSize: batch.length,
        msg: err instanceof Error ? err.message : String(err),
      });
      continue; // try next batch
    }

    // Persist non-empty fields per result. Always set taxonomy_inferred=true
    // for the contact even if Claude returned all nulls (so we don't
    // re-attempt fruitless inferences).
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const c of batch) {
      const r = byId.get(c.id);
      const update: ContactUpdate = { taxonomy_inferred: true };
      if (r) {
        if (r.industry) update.industry = r.industry;
        if (r.sector) update.sector = r.sector;
        if (r.team) update.team = r.team;
        if (r.seniority) update.seniority = r.seniority;
      }
      const { error } = await supabase
        .from("contacts")
        .update(update)
        .eq("clerk_user_id", userId)
        .eq("id", c.id)
        .eq("taxonomy_inferred", false); // never overwrite later
      if (!error) updated += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: candidates.length,
    updated,
  });
}

// GET /api/enrich/taxonomy — returns the count of contacts still pending
// taxonomy inference. Used by the import page to show a progress badge.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();
  const { count } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("clerk_user_id", userId)
    .eq("taxonomy_inferred", false)
    .is("industry", null)
    .not("company", "is", null);
  return NextResponse.json({ ok: true, pending: count ?? 0 });
}
