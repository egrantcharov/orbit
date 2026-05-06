import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const maxDuration = 10;

// GET /api/search?q=...&limit=10 — combined fuzzy-ish search across
// contacts (display_name / email / company / job_title), articles
// (title / author + publication name via separate fetch), and
// interactions (title / body). Returns ranked groups for the ⌘K omnibar.

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function escapeIlike(s: string): string {
  return s.replace(/[%_]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const qRaw = url.searchParams.get("q") ?? "";
  const q = qRaw.trim();
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(
      1,
      parseInt(url.searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT,
    ),
  );

  if (q.length < 1) {
    return NextResponse.json({
      ok: true,
      contacts: [],
      articles: [],
      interactions: [],
    });
  }

  const supabase = createSupabaseServiceClient();
  const pattern = `%${escapeIlike(q)}%`;

  // Run the three searches in parallel.
  const [contactsRes, articlesRes, interactionsRes] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id, email, display_name, company, job_title, score_keep_in_touch",
      )
      .eq("clerk_user_id", userId)
      .eq("is_archived", false)
      .or(
        `display_name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern},job_title.ilike.${pattern}`,
      )
      .order("score_keep_in_touch", { ascending: false, nullsFirst: false })
      .order("display_name", { ascending: true, nullsFirst: false })
      .limit(limit),
    supabase
      .from("articles")
      .select(
        "id, publication_id, url, title, author, snippet, published_at",
      )
      .eq("clerk_user_id", userId)
      .or(`title.ilike.${pattern},author.ilike.${pattern}`)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit),
    supabase
      .from("interactions")
      .select("id, contact_id, kind, title, body, occurred_at")
      .eq("clerk_user_id", userId)
      .or(`title.ilike.${pattern},body.ilike.${pattern}`)
      .order("occurred_at", { ascending: false })
      .limit(limit),
  ]);

  // Resolve publication names for the article rows.
  const articles = articlesRes.data ?? [];
  const pubIds = Array.from(new Set(articles.map((a) => a.publication_id)));
  const { data: pubs } = pubIds.length
    ? await supabase
        .from("publications")
        .select("id, name")
        .in("id", pubIds)
    : { data: [] };
  const pubName = new Map((pubs ?? []).map((p) => [p.id, p.name]));

  // Resolve contact names for interaction rows.
  const interactions = interactionsRes.data ?? [];
  const contactIds = Array.from(
    new Set(interactions.map((i) => i.contact_id)),
  );
  const { data: relatedContacts } = contactIds.length
    ? await supabase
        .from("contacts")
        .select("id, display_name, email")
        .in("id", contactIds)
    : { data: [] };
  const contactName = new Map(
    (relatedContacts ?? []).map((c) => [c.id, c.display_name ?? c.email ?? ""]),
  );

  return NextResponse.json({
    ok: true,
    contacts: contactsRes.data ?? [],
    articles: articles.map((a) => ({
      ...a,
      publication_name: pubName.get(a.publication_id) ?? null,
    })),
    interactions: interactions.map((i) => ({
      ...i,
      contact_name: contactName.get(i.contact_id) ?? null,
    })),
  });
}
