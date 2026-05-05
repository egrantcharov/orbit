import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// Returns the user's network grouped by a chosen dimension. The page can
// re-pivot on the client without a refetch — but we keep the shape
// consistent so the UI is dumb.
//
// Group dimensions: 'industry' | 'sector' | 'company' | 'school' | 'team'
// Returns: groups: [{ key, count, contacts: [{ ... }] }]

export type NetworkContact = {
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
  met_at: string | null;
  met_on: string | null;
  met_via: string | null;
  notes: string | null;
  birthday: string | null;
  linkedin_url: string | null;
  is_pinned: boolean;
  score_keep_in_touch: number | null;
  score_career_relevance: number | null;
  last_interaction_at: string | null;
};

export type NetworkGroup = {
  key: string;       // industry / sector / company / school / team value
  count: number;
  // Sub-grouping when the primary group is industry/sector — we always
  // fan out to companies underneath. Otherwise contacts list directly.
  companies?: Array<{ name: string; count: number; contacts: NetworkContact[] }>;
  contacts?: NetworkContact[];
};

const ALLOWED_GROUPS = ["industry", "sector", "company", "school", "team"] as const;
type GroupKey = (typeof ALLOWED_GROUPS)[number];

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const groupParam = url.searchParams.get("group") ?? "industry";
  const group: GroupKey = (ALLOWED_GROUPS as readonly string[]).includes(groupParam)
    ? (groupParam as GroupKey)
    : "industry";

  const supabase = createSupabaseServiceClient();
  const { data: rows } = await supabase
    .from("contacts")
    .select(
      "id, email, display_name, company, job_title, industry, sector, team, school, location, met_at, met_on, met_via, notes, birthday, linkedin_url, is_pinned, score_keep_in_touch, score_career_relevance, last_interaction_at",
    )
    .eq("clerk_user_id", userId)
    .eq("is_archived", false)
    .order("display_name", { ascending: true, nullsFirst: false });

  const all = (rows ?? []) as NetworkContact[];

  // Bucket helper.
  function valueFor(c: NetworkContact, key: GroupKey): string {
    return (c[key] ?? "").trim() || "(unspecified)";
  }

  if (group === "industry" || group === "sector") {
    // Two-level: <industry|sector> → company → contacts.
    const map = new Map<string, Map<string, NetworkContact[]>>();
    for (const c of all) {
      const top = valueFor(c, group);
      const company = (c.company ?? "").trim() || "(no company)";
      if (!map.has(top)) map.set(top, new Map());
      const inner = map.get(top)!;
      if (!inner.has(company)) inner.set(company, []);
      inner.get(company)!.push(c);
    }
    const groups: NetworkGroup[] = Array.from(map.entries())
      .map(([key, inner]) => {
        const companies = Array.from(inner.entries())
          .map(([name, contacts]) => ({
            name,
            count: contacts.length,
            contacts: contacts.sort(sortContacts),
          }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        return {
          key,
          count: companies.reduce((s, c) => s + c.count, 0),
          companies,
        };
      })
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    return NextResponse.json({ ok: true, group, groups });
  }

  // Single-level: company / school / team → contacts.
  const map = new Map<string, NetworkContact[]>();
  for (const c of all) {
    const k = valueFor(c, group);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(c);
  }
  const groups: NetworkGroup[] = Array.from(map.entries())
    .map(([key, contacts]) => ({
      key,
      count: contacts.length,
      contacts: contacts.sort(sortContacts),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return NextResponse.json({ ok: true, group, groups });
}

function sortContacts(a: NetworkContact, b: NetworkContact): number {
  // Pinned first, then by score_keep_in_touch desc, then name.
  if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
  const sa = a.score_keep_in_touch ?? -1;
  const sb = b.score_keep_in_touch ?? -1;
  if (sa !== sb) return sb - sa;
  const na = a.display_name ?? a.email ?? "";
  const nb = b.display_name ?? b.email ?? "";
  return na.localeCompare(nb);
}
