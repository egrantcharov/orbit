import { parseFeed } from "@/lib/feeds/parse";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/types/database";

type ArticleInsert = Database["public"]["Tables"]["articles"]["Insert"];

const FETCH_TIMEOUT_MS = 15_000;
const ARTICLES_PER_PUBLICATION = 30;

export type PollResult = {
  ok: boolean;
  inserted: number;
  fetchedTitle: string | null;
  fetchedItems: number;
  error?: string;
};

export async function pollPublication(
  clerkUserId: string,
  publicationId: string,
): Promise<PollResult> {
  const supabase = createSupabaseServiceClient();
  const { data: pub, error: pubErr } = await supabase
    .from("publications")
    .select("id, feed_url, name, site_url")
    .eq("clerk_user_id", clerkUserId)
    .eq("id", publicationId)
    .maybeSingle();
  if (pubErr || !pub) {
    return { ok: false, inserted: 0, fetchedTitle: null, fetchedItems: 0, error: "not_found" };
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let xml: string;
  try {
    const res = await fetch(pub.feed_url, {
      headers: { "User-Agent": "Mozilla/5.0 OrbitFeedReader" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      await markError(supabase, pub.id, `HTTP ${res.status}`);
      return {
        ok: false,
        inserted: 0,
        fetchedTitle: null,
        fetchedItems: 0,
        error: `HTTP ${res.status}`,
      };
    }
    xml = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markError(supabase, pub.id, msg);
    return { ok: false, inserted: 0, fetchedTitle: null, fetchedItems: 0, error: msg };
  } finally {
    clearTimeout(timeout);
  }

  let parsed;
  try {
    parsed = parseFeed(xml);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markError(supabase, pub.id, msg);
    return { ok: false, inserted: 0, fetchedTitle: null, fetchedItems: 0, error: msg };
  }

  if (parsed.items.length === 0) {
    await markPolled(supabase, pub.id);
    return { ok: true, inserted: 0, fetchedTitle: parsed.title, fetchedItems: 0 };
  }

  const rows: ArticleInsert[] = parsed.items
    .slice(0, ARTICLES_PER_PUBLICATION)
    .map((it) => ({
      clerk_user_id: clerkUserId,
      publication_id: pub.id,
      guid: it.guid,
      url: it.url,
      title: it.title,
      author: it.author,
      snippet: it.snippet,
      published_at: it.publishedAt,
    }));

  // Upsert by (publication_id, lower(url)) — most reliable cross-feed key.
  const { error: upsertErr } = await supabase
    .from("articles")
    .upsert(rows, { onConflict: "publication_id,url", ignoreDuplicates: true });
  if (upsertErr) {
    await markError(supabase, pub.id, upsertErr.message);
    return {
      ok: false,
      inserted: 0,
      fetchedTitle: parsed.title,
      fetchedItems: rows.length,
      error: upsertErr.message,
    };
  }

  await markPolled(supabase, pub.id, parsed.title ?? null, parsed.siteUrl ?? null);

  return {
    ok: true,
    inserted: rows.length,
    fetchedTitle: parsed.title,
    fetchedItems: rows.length,
  };
}

async function markPolled(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  id: string,
  title?: string | null,
  siteUrl?: string | null,
): Promise<void> {
  const update: Database["public"]["Tables"]["publications"]["Update"] = {
    last_polled_at: new Date().toISOString(),
    poll_error: null,
  };
  if (title) update.name = title;
  if (siteUrl) update.site_url = siteUrl;
  await supabase.from("publications").update(update).eq("id", id);
}

async function markError(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  id: string,
  msg: string,
): Promise<void> {
  await supabase
    .from("publications")
    .update({
      last_polled_at: new Date().toISOString(),
      poll_error: msg.slice(0, 500),
    })
    .eq("id", id);
}
