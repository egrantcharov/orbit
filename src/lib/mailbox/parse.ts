/**
 * Provider-agnostic helpers for parsing email bodies + addresses. Extracted
 * from the v2 Gmail sync so any future Outlook adapter can reuse them.
 */

import { gmail_v1 } from "googleapis";

export type ParsedAddress = { name: string | null; email: string };

export function parseAddresses(headerValue: string | undefined): ParsedAddress[] {
  if (!headerValue) return [];
  return splitAtTopLevelCommas(headerValue)
    .map((piece) => parseSingle(piece.trim()))
    .filter((p): p is ParsedAddress => p !== null);
}

function splitAtTopLevelCommas(value: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (const ch of value) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "," && !inQuotes) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim().length > 0) out.push(buf);
  return out;
}

function parseSingle(piece: string): ParsedAddress | null {
  const angle = piece.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (angle) {
    const name = angle[1].trim();
    const email = angle[2].trim().toLowerCase();
    if (!email.includes("@")) return null;
    return { name: name.length > 0 ? name : null, email };
  }
  const bare = piece.trim().toLowerCase();
  if (bare.includes("@")) return { name: null, email: bare };
  return null;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|li|tr|td|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeBase64Url(data: string): string {
  const buf = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return buf.toString("utf8");
}

// Walk a Gmail MIME tree looking for the best body candidate. Prefer
// text/plain; fall back to a stripped text/html. Returns null if nothing
// usable found.
export function extractBodyText(
  payload: gmail_v1.Schema$MessagePart | undefined,
): string | null {
  if (!payload) return null;

  const candidates: { mime: string; data: string }[] = [];
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    const mime = (part.mimeType ?? "").toLowerCase();
    const data = part.body?.data;
    if (data && (mime === "text/plain" || mime === "text/html")) {
      candidates.push({ mime, data });
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  };
  walk(payload);

  const plain = candidates.find((c) => c.mime === "text/plain");
  if (plain) {
    const text = decodeBase64Url(plain.data).trim();
    if (text.length > 0) return text;
  }
  const html = candidates.find((c) => c.mime === "text/html");
  if (html) {
    const text = htmlToText(decodeBase64Url(html.data));
    if (text.length > 0) return text;
  }
  return null;
}

export function headerValue(
  msg: gmail_v1.Schema$Message,
  name: string,
): string | undefined {
  const h = msg.payload?.headers?.find(
    (x) => x.name?.toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? undefined;
}
