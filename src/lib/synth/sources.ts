import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { SynthSourceItem } from "@/lib/anthropic/synth";

// Pulls items for the synth Claude pass from BOTH sources:
//   - articles (RSS subscriptions)
//   - threads where has_unsubscribe AND NOT user_participated (bulk newsletters)
//
// Hybrid source means new users without RSS still get value from their
// newsletter inbox. Power users with RSS get richer synth.

export async function fetchSynthSources(args: {
  clerkUserId: string;
  windowHours: number;
  cap?: number;
}): Promise<SynthSourceItem[]> {
  const { clerkUserId, windowHours } = args;
  const cap = args.cap ?? 80;
  const supabase = createSupabaseServiceClient();
  const cutoff = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  // Articles in window — published_at preferred, fall back to fetched_at.
  const { data: articles } = await supabase
    .from("articles")
    .select(
      "id, url, title, snippet, content_excerpt, published_at, fetched_at, publication_id",
    )
    .eq("clerk_user_id", clerkUserId)
    .or(`published_at.gte.${cutoff},fetched_at.gte.${cutoff}`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("fetched_at", { ascending: false })
    .limit(cap);

  const pubIds = Array.from(
    new Set((articles ?? []).map((a) => a.publication_id)),
  );
  const { data: pubs } = pubIds.length
    ? await supabase
        .from("publications")
        .select("id, name")
        .in("id", pubIds)
    : { data: [] };
  const pubName = new Map((pubs ?? []).map((p) => [p.id, p.name]));

  const articleItems: SynthSourceItem[] = (articles ?? [])
    .filter((a) => a.title || a.snippet || a.content_excerpt)
    .map((a) => ({
      kind: "article",
      from: pubName.get(a.publication_id) ?? "(unknown)",
      title: a.title ?? "(untitled)",
      body: a.content_excerpt ?? a.snippet ?? null,
      date: a.published_at ?? a.fetched_at,
      sourceId: a.id,
      sourceUrl: a.url,
    }));

  // Newsletter threads in window
  const { data: threads } = await supabase
    .from("threads")
    .select("id, subject, snippet, body_excerpt, last_message_at, reply_to")
    .eq("clerk_user_id", clerkUserId)
    .eq("has_unsubscribe", true)
    .eq("user_participated", false)
    .gte("last_message_at", cutoff)
    .not("subject", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(cap);

  // Resolve sender names via thread_participants (role=from)
  const threadIds = (threads ?? []).map((t) => t.id);
  const { data: links } = threadIds.length
    ? await supabase
        .from("thread_participants")
        .select("thread_id, contact_id")
        .in("thread_id", threadIds)
        .eq("role", "from")
    : { data: [] };
  const contactIds = Array.from(
    new Set((links ?? []).map((l) => l.contact_id)),
  );
  const { data: contacts } = contactIds.length
    ? await supabase
        .from("contacts")
        .select("id, email, display_name")
        .in("id", contactIds)
    : { data: [] };
  const contactName = new Map(
    (contacts ?? []).map((c) => [c.id, c.display_name ?? c.email ?? ""]),
  );
  const fromByThread = new Map<string, string>();
  for (const l of links ?? []) {
    if (!fromByThread.has(l.thread_id)) {
      fromByThread.set(l.thread_id, contactName.get(l.contact_id) ?? "");
    }
  }

  const threadItems: SynthSourceItem[] = (threads ?? [])
    .filter((t) => t.last_message_at && t.subject)
    .map((t) => ({
      kind: "newsletter_thread",
      from: fromByThread.get(t.id) || t.reply_to || "(unknown sender)",
      title: t.subject!,
      body: t.body_excerpt ?? t.snippet,
      date: t.last_message_at!,
      sourceId: t.id,
    }));

  // Merge by date, take the most recent `cap` items.
  return [...articleItems, ...threadItems]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, cap);
}
