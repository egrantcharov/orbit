import type { BookmarkKind } from "@/lib/types/database";

export type ExtractedMetadata = {
  title: string | null;
  description: string | null;
};

/**
 * Fetch a URL's clean markdown via Jina Reader. Returns the full markdown
 * for downstream consumers (TLDR, indexing, etc.). Falls back to empty
 * string on error.
 */
export async function fetchArticleMarkdown(url: string): Promise<string> {
  try {
    const target = `https://r.jina.ai/${url}`;
    const res = await fetch(target, {
      headers: {
        "X-With-Generated-Alt": "true",
        "X-Return-Format": "markdown",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * Fetch a URL's clean markdown via Jina Reader (no auth required for the
 * public free tier, generous for personal use). We extract the first
 * non-empty H1 / Title for the bookmark title and the first paragraph for
 * the description. Returns nulls if the fetch or parse fails — never throws.
 */
export async function extractMetadata(url: string): Promise<ExtractedMetadata> {
  try {
    const target = `https://r.jina.ai/${url}`;
    const res = await fetch(target, {
      headers: {
        // Ask Jina to also include OpenGraph/Title metadata in the response.
        "X-With-Generated-Alt": "true",
        "X-Return-Format": "markdown",
      },
      // Bookmarks should never block the user for too long.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { title: null, description: null };
    const markdown = await res.text();
    return parseFromJinaMarkdown(markdown);
  } catch {
    return { title: null, description: null };
  }
}

/**
 * Jina returns markdown with a `Title:` and `URL Source:` header block at
 * the top, then the rendered content. Pull the title and the first
 * non-empty paragraph as a description.
 */
function parseFromJinaMarkdown(md: string): ExtractedMetadata {
  let title: string | null = null;
  let description: string | null = null;

  const lines = md.split(/\r?\n/);

  for (const line of lines) {
    const m = line.match(/^Title:\s*(.+?)\s*$/i);
    if (m) {
      title = m[1];
      break;
    }
    const h = line.match(/^#\s+(.+?)\s*$/);
    if (h) {
      title = h[1];
      break;
    }
  }

  // Description: first non-empty paragraph after the metadata header.
  let inBody = false;
  const buf: string[] = [];
  for (const line of lines) {
    if (!inBody) {
      if (line.startsWith("Markdown Content:") || /^#\s+/.test(line)) {
        inBody = true;
      }
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "" && buf.length > 0) break;
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
    buf.push(trimmed);
    if (buf.join(" ").length > 200) break;
  }
  if (buf.length > 0) {
    description = buf.join(" ").slice(0, 240);
  }

  return { title, description };
}

const NEWSLETTER_HOSTS = [
  "substack.com",
  "beehiiv.com",
  "convertkit.com",
  "buttondown.email",
  "ghost.io",
  "tinyletter.com",
  "morningbrew.com",
  "axios.com",
  "stratechery.com",
];

const TOOL_HOSTS = [
  "vercel.com",
  "supabase.com",
  "cloudflare.com",
  "anthropic.com",
  "openai.com",
  "linear.app",
  "notion.so",
  "figma.com",
];

const ARTICLE_HOSTS = [
  "medium.com",
  "dev.to",
  "hashnode.dev",
  "lesswrong.com",
  "nytimes.com",
  "theverge.com",
  "wired.com",
  "arstechnica.com",
];

export function classifyUrl(url: string): BookmarkKind {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "other";
  }

  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (NEWSLETTER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return "newsletter";
  }
  if (TOOL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return "tool";
  }
  if (ARTICLE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return "article";
  }
  return "other";
}
