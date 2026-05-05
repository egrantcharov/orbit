import { XMLParser } from "fast-xml-parser";

// Tiny RSS / Atom parser. Returns normalized items so the article-upsert
// loop doesn't care about feed dialect. We tolerate ragged feeds (missing
// guid, missing date, raw HTML in description) since most newsletters
// produce some variant of these.

export type ParsedFeed = {
  title: string | null;
  description: string | null;
  siteUrl: string | null;
  items: ParsedFeedItem[];
};

export type ParsedFeedItem = {
  guid: string | null;
  url: string;
  title: string | null;
  author: string | null;
  snippet: string | null;
  publishedAt: string | null; // ISO
};

const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function pickText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return (obj["#text"] as string).trim() || null;
    // Atom <link href="..."/>
    if (typeof obj["@_href"] === "string") return obj["@_href"] as string;
  }
  return null;
}

function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

export function parseFeed(xml: string): ParsedFeed {
  const doc = XML.parse(xml) as Record<string, unknown>;

  // RSS 2.0
  const rss = doc.rss as Record<string, unknown> | undefined;
  if (rss && typeof rss === "object") {
    const channel = (rss.channel ?? {}) as Record<string, unknown>;
    const title = pickText(channel.title);
    const description = pickText(channel.description);
    const siteUrl = pickText(channel.link);
    const items = asArray(channel.item).map((it) => {
      const item = it as Record<string, unknown>;
      const link = pickText(item.link);
      const guid = pickText(item.guid) ?? link;
      const desc = pickText(item.description);
      return {
        guid,
        url: link ?? "",
        title: pickText(item.title),
        author:
          pickText(item.author) ??
          pickText(item["dc:creator"]) ??
          pickText(item["creator"]),
        snippet: desc ? stripHtml(desc).slice(0, 500) : null,
        publishedAt: isoOrNull(pickText(item.pubDate) ?? pickText(item["dc:date"])),
      };
    });
    return { title, description, siteUrl, items: items.filter((i) => i.url) };
  }

  // Atom 1.0
  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed && typeof feed === "object") {
    const title = pickText(feed.title);
    const description = pickText(feed.subtitle);
    const linkArr = asArray(feed.link);
    const siteUrl =
      linkArr.map((l) => pickText(l)).find((s) => s && !s.includes("xml")) ??
      pickText(linkArr[0]);
    const items = asArray(feed.entry).map((it) => {
      const item = it as Record<string, unknown>;
      const linkA = asArray(item.link)
        .map((l) => l as Record<string, unknown>)
        .find(
          (l) => (l["@_rel"] as string | undefined) !== "self" && l["@_href"],
        );
      const url = (linkA?.["@_href"] as string | undefined) ?? null;
      const guid = pickText(item.id) ?? url;
      const desc = pickText(item.summary) ?? pickText(item.content);
      return {
        guid,
        url: url ?? "",
        title: pickText(item.title),
        author:
          pickText((item.author as Record<string, unknown> | undefined)?.name) ??
          pickText(item.author),
        snippet: desc ? stripHtml(desc).slice(0, 500) : null,
        publishedAt: isoOrNull(pickText(item.published) ?? pickText(item.updated)),
      };
    });
    return { title, description, siteUrl, items: items.filter((i) => i.url) };
  }

  return { title: null, description: null, siteUrl: null, items: [] };
}

// Try to discover the RSS/Atom feed URL from a homepage URL. Looks for
// <link rel="alternate" type="application/rss+xml" href="…"> and similar.
export async function discoverFeed(homepageUrl: string): Promise<string | null> {
  let html: string;
  try {
    const res = await fetch(homepageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 OrbitFeedDiscovery" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }
  // Match <link ... rel="..." type="..." href="...">
  const linkRe = /<link\b([^>]*)>/gi;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const attrs = m[1];
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    if (!href) continue;
    if (
      rel.toLowerCase().includes("alternate") &&
      (type.includes("rss") || type.includes("atom") || type.includes("xml"))
    ) {
      candidates.push(absolutize(href, homepageUrl));
    }
  }
  // Prefer feed.xml / atom.xml / rss + Substack-style /feed at the end.
  candidates.sort((a, b) => {
    const score = (s: string) =>
      /atom/i.test(s)
        ? 0
        : /rss/i.test(s)
          ? 1
          : /feed/i.test(s)
            ? 2
            : 3;
    return score(a) - score(b);
  });
  if (candidates[0]) return candidates[0];
  // Common fallbacks for Substack and similar.
  try {
    const u = new URL(homepageUrl);
    const candidates = [
      `${u.origin}/feed`,
      `${u.origin}/rss`,
      `${u.origin}/feed.xml`,
      `${u.origin}/atom.xml`,
      `${u.origin}/index.xml`,
    ];
    for (const c of candidates) {
      try {
        const r = await fetch(c, { redirect: "follow" });
        if (r.ok) {
          const ct = r.headers.get("content-type") ?? "";
          if (ct.includes("xml") || ct.includes("rss") || ct.includes("atom")) {
            return c;
          }
        }
      } catch {
        /* keep trying */
      }
    }
  } catch {
    /* not a valid url */
  }
  return null;
}

function absolutize(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
