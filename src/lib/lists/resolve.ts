import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ListFilter } from "@/lib/types/database";

// Translate a ListFilter jsonb blob into a Supabase query that returns
// matching contact ids. The list view also pulls explicitly-added members
// from list_contacts; resolveList is only the "auto-include" set.

const SELECT_FIELDS =
  "id, email, display_name, company, job_title, industry, sector, team, school, location, last_interaction_at, message_count, is_pinned, is_archived, score_keep_in_touch, score_career_relevance, tags, taxonomy_inferred, seniority";

export type ResolvedContact = {
  id: string;
  email: string | null;
  display_name: string | null;
  company: string | null;
  job_title: string | null;
  industry: string | null;
  sector: string | null;
  team: string | null;
  school: string | null;
  location: string | null;
  last_interaction_at: string | null;
  message_count: number;
  is_pinned: boolean;
  is_archived: boolean;
  score_keep_in_touch: number | null;
  score_career_relevance: number | null;
  tags: string[];
  taxonomy_inferred: boolean;
  seniority: string | null;
};

export async function resolveListFilter(args: {
  clerkUserId: string;
  filter: ListFilter;
  limit?: number;
}): Promise<ResolvedContact[]> {
  const { clerkUserId, filter } = args;
  const limit = args.limit ?? 500;

  const supabase = createSupabaseServiceClient();
  let q = supabase
    .from("contacts")
    .select(SELECT_FIELDS)
    .eq("clerk_user_id", clerkUserId)
    .eq("is_archived", false)
    .order("score_keep_in_touch", { ascending: false, nullsFirst: false })
    .order("display_name", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (filter.industry?.length) q = q.in("industry", filter.industry);
  if (filter.sector?.length) q = q.in("sector", filter.sector);
  if (filter.company?.length) q = q.in("company", filter.company);
  if (filter.team?.length) q = q.in("team", filter.team);
  if (filter.school?.length) q = q.in("school", filter.school);
  if (Array.isArray(filter.tags_any) && filter.tags_any.length > 0) {
    q = q.overlaps("tags", filter.tags_any);
  }
  if (typeof filter.is_pinned === "boolean") q = q.eq("is_pinned", filter.is_pinned);
  if (typeof filter.days_since_interaction_gte === "number") {
    const cutoff = new Date(
      Date.now() - filter.days_since_interaction_gte * 86_400_000,
    ).toISOString();
    q = q.lt("last_interaction_at", cutoff);
  }
  if (typeof filter.min_keep_in_touch === "number") {
    q = q.gte("score_keep_in_touch", filter.min_keep_in_touch);
  }
  if (typeof filter.min_career_relevance === "number") {
    q = q.gte("score_career_relevance", filter.min_career_relevance);
  }
  if (filter.search_text && filter.search_text.trim().length > 0) {
    const s = `%${filter.search_text.trim().replace(/[%_]/g, "\\$&")}%`;
    q = q.or(
      `notes.ilike.${s},interests.ilike.${s},met_via.ilike.${s},met_at.ilike.${s},display_name.ilike.${s},email.ilike.${s},company.ilike.${s},job_title.ilike.${s}`,
    );
  }

  const { data } = await q;
  return (data ?? []) as ResolvedContact[];
}
