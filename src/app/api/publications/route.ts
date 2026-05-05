import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { discoverFeed, parseFeed } from "@/lib/feeds/parse";
import { pollPublication } from "@/lib/feeds/poll";

export const maxDuration = 30;

function clean(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function isUrl(v: string): boolean {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("publications")
    .select(
      "id, name, feed_url, site_url, description, last_polled_at, poll_error, created_at",
    )
    .eq("clerk_user_id", userId)
    .order("created_at", { ascending: false });
  return NextResponse.json({ ok: true, publications: data ?? [] });
}

// Add a publication. Accepts either a homepage URL (we auto-discover the
// feed) or a direct feed URL (recognized by content-type or /feed-ish path).
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { url?: unknown; name?: unknown };
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const url = clean(body.url, 500);
  if (!url || !isUrl(url)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  // Decide: did the user paste a direct feed URL, or a homepage?
  let feedUrl: string | null = null;
  let siteUrl: string | null = null;
  let title: string | null = clean(body.name, 200);

  // Try to fetch and detect.
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 OrbitFeedDetect" },
      redirect: "follow",
    });
    const ct = res.headers.get("content-type") ?? "";
    if (
      ct.includes("xml") ||
      ct.includes("rss") ||
      ct.includes("atom") ||
      url.match(/\.(xml|rss|atom)$|\/feed\/?$|\/rss\/?$|\/atom\/?$/i)
    ) {
      const xml = await res.text();
      const parsed = parseFeed(xml);
      if (parsed.items.length === 0 && !parsed.title) {
        // not a real feed, fall back to discovery
      } else {
        feedUrl = url;
        siteUrl = parsed.siteUrl ?? null;
        title = title ?? parsed.title ?? null;
      }
    }
  } catch {
    /* fall through to discovery */
  }
  if (!feedUrl) {
    feedUrl = await discoverFeed(url);
    siteUrl = url;
    if (!feedUrl) {
      return NextResponse.json(
        {
          error: "no_feed_found",
          message:
            "Could not auto-detect an RSS/Atom feed. Paste the direct feed URL.",
        },
        { status: 400 },
      );
    }
  }

  const supabase = createSupabaseServiceClient();
  await supabase
    .from("app_users")
    .upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id" });

  // Dedupe: per-user lower(feed_url) unique index.
  const { data: existing } = await supabase
    .from("publications")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("feed_url", feedUrl)
    .maybeSingle();
  if (existing) {
    // Re-poll to refresh content.
    await pollPublication(userId, existing.id);
    return NextResponse.json({ ok: true, id: existing.id, existed: true });
  }

  const { data: row, error } = await supabase
    .from("publications")
    .insert({
      clerk_user_id: userId,
      name: title ?? feedUrl,
      feed_url: feedUrl,
      site_url: siteUrl,
    })
    .select("id")
    .maybeSingle();
  if (error || !row) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  // Initial poll.
  await pollPublication(userId, row.id);
  return NextResponse.json({ ok: true, id: row.id });
}
