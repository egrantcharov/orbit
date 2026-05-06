#!/usr/bin/env tsx
/**
 * One-shot script to seed a curated starter pack of RSS publications and
 * populate articles. Talks to Postgres directly (pg + fast-xml-parser) so
 * it doesn't depend on the Supabase JS client / NEXT_PUBLIC_* env vars.
 *
 * Usage: npm run seed:pubs
 * Requires SUPABASE_DB_URL in .env.local (already set if `npm run migrate` works).
 */

import { config as loadDotenv } from "dotenv";
import { Client } from "pg";
loadDotenv({ path: ".env.local" });
loadDotenv();

import { parseFeed } from "../src/lib/feeds/parse";

type Pub = { name: string; feed_url: string; category: string };

// Curated starter pack — selected for free RSS, high signal, and broad
// coverage for a senior at UChicago with IB-recruiting + tech interests.
const PUBS: Pub[] = [
  // Tech strategy / product / engineering
  { name: "Stratechery", feed_url: "https://stratechery.com/feed/", category: "Tech" },
  { name: "The Pragmatic Engineer", feed_url: "https://newsletter.pragmaticengineer.com/feed", category: "Tech" },
  { name: "Simon Willison's Weblog", feed_url: "https://simonwillison.net/atom/everything/", category: "Tech" },
  { name: "Platformer", feed_url: "https://www.platformer.news/feed", category: "Tech" },
  { name: "Lenny's Newsletter", feed_url: "https://www.lennysnewsletter.com/feed", category: "Tech" },
  { name: "Latent Space", feed_url: "https://www.latent.space/feed", category: "AI" },
  { name: "Import AI", feed_url: "https://importai.substack.com/feed", category: "AI" },

  // Finance / markets
  { name: "The Diff", feed_url: "https://www.thediff.co/feed", category: "Finance" },
  { name: "Bits about Money", feed_url: "https://www.bitsaboutmoney.com/archive/rss/", category: "Finance" },
  { name: "Not Boring", feed_url: "https://www.notboring.co/feed", category: "Finance" },
  { name: "The Generalist", feed_url: "https://www.generalist.com/feed", category: "Finance" },

  // Ideas / analysis
  { name: "Marginal Revolution", feed_url: "https://marginalrevolution.com/feed", category: "Ideas" },
  { name: "Astral Codex Ten", feed_url: "https://www.astralcodexten.com/feed", category: "Ideas" },
  { name: "Slow Boring", feed_url: "https://www.slowboring.com/feed", category: "Ideas" },

  // Aggregator
  { name: "Hacker News — Front Page", feed_url: "https://hnrss.org/frontpage", category: "Aggregator" },
];

const FETCH_TIMEOUT_MS = 15_000;
const ARTICLES_PER_FEED = 20;

function pickConn(): string {
  const u =
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!u) {
    throw new Error("SUPABASE_DB_URL not set in .env.local");
  }
  return u;
}

async function fetchFeed(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 OrbitFeedSeeder" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getOrCreateUser(client: Client): Promise<string> {
  const r = await client.query<{ clerk_user_id: string }>(
    "select clerk_user_id from app_users order by created_at asc limit 1",
  );
  if (r.rows.length === 0) {
    throw new Error(
      "No app_users row found. Open /app once while signed in, then re-run.",
    );
  }
  return r.rows[0].clerk_user_id;
}

async function ensurePublication(
  client: Client,
  userId: string,
  pub: Pub,
): Promise<{ id: string; existed: boolean }> {
  const existing = await client.query<{ id: string }>(
    "select id from publications where clerk_user_id = $1 and lower(feed_url) = lower($2) limit 1",
    [userId, pub.feed_url],
  );
  if (existing.rows.length > 0) {
    return { id: existing.rows[0].id, existed: true };
  }
  const ins = await client.query<{ id: string }>(
    "insert into publications (clerk_user_id, name, feed_url) values ($1, $2, $3) returning id",
    [userId, pub.name, pub.feed_url],
  );
  return { id: ins.rows[0].id, existed: false };
}

async function pollIntoDb(
  client: Client,
  userId: string,
  pubId: string,
  feedUrl: string,
): Promise<{ inserted: number; error?: string }> {
  const xml = await fetchFeed(feedUrl);
  if (xml == null) {
    await client.query(
      "update publications set last_polled_at = now(), poll_error = $1 where id = $2",
      ["fetch failed", pubId],
    );
    return { inserted: 0, error: "fetch failed" };
  }
  let parsed;
  try {
    parsed = parseFeed(xml);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await client.query(
      "update publications set last_polled_at = now(), poll_error = $1 where id = $2",
      [msg.slice(0, 500), pubId],
    );
    return { inserted: 0, error: msg };
  }
  if (parsed.items.length === 0) {
    await client.query(
      "update publications set last_polled_at = now(), poll_error = null, name = coalesce($2, name), site_url = coalesce($3, site_url) where id = $1",
      [pubId, parsed.title, parsed.siteUrl],
    );
    return { inserted: 0 };
  }

  let inserted = 0;
  for (const it of parsed.items.slice(0, ARTICLES_PER_FEED)) {
    if (!it.url) continue;
    try {
      const r = await client.query(
        `insert into articles (clerk_user_id, publication_id, guid, url, title, author, snippet, published_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (publication_id, lower(url)) do nothing
         returning id`,
        [
          userId,
          pubId,
          it.guid,
          it.url,
          it.title,
          it.author,
          it.snippet,
          it.publishedAt,
        ],
      );
      if ((r.rowCount ?? 0) > 0) inserted += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("articles_pub_guid_uniq")) continue;
      console.warn("    article insert error:", msg.slice(0, 120));
    }
  }
  await client.query(
    "update publications set last_polled_at = now(), poll_error = null, name = coalesce($2, name), site_url = coalesce($3, site_url) where id = $1",
    [pubId, parsed.title, parsed.siteUrl],
  );
  return { inserted };
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: pickConn() });
  await client.connect();

  let inserted = 0;
  let skipped = 0;
  let totalArticles = 0;
  const errors: string[] = [];

  try {
    const userId = await getOrCreateUser(client);
    console.log(`seeding for user: ${userId}\n`);

    for (const pub of PUBS) {
      try {
        const { id: pubId, existed } = await ensurePublication(client, userId, pub);
        if (existed) {
          skipped += 1;
          console.log(`  · ${pub.name} (already subscribed)`);
        } else {
          inserted += 1;
          console.log(`  + ${pub.name} (${pub.category})`);
        }
        const r = await pollIntoDb(client, userId, pubId, pub.feed_url);
        if (r.error) {
          errors.push(`${pub.name}: ${r.error}`);
          console.log(`      ↳ poll FAILED · ${r.error}`);
        } else {
          totalArticles += r.inserted;
          console.log(
            `      ↳ ${r.inserted} new article${r.inserted === 1 ? "" : "s"}`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${pub.name}: ${msg}`);
        console.log(`      ↳ FAILED · ${msg}`);
      }
    }
  } finally {
    await client.end();
  }

  console.log("\n— summary —");
  console.log(`subscriptions added: ${inserted}`);
  console.log(`already subscribed: ${skipped}`);
  console.log(`articles inserted: ${totalArticles}`);
  if (errors.length > 0) {
    console.log(`\n${errors.length} feed${errors.length === 1 ? "" : "s"} had issues:`);
    for (const e of errors) console.log("  -", e);
    console.log(
      "\nThe failed feeds are still saved — try Refresh on /app/reads, the URL might be a redirect.",
    );
  }
  console.log("\nDone. Visit /app/reads.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
