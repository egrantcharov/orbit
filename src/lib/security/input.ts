/**
 * Shared input-validation helpers for API route handlers.
 *
 * Why hand-rolled instead of zod? The schemas across this codebase are
 * mostly "one string field plus a few enums" — a 30-line module reads
 * more clearly than a dependency, and matches the project's "no
 * premature abstractions" rule. If schemas get more complex (nested
 * objects, discriminated unions), swap in zod and re-export from here.
 */

import { NextResponse } from "next/server";

export const DEFAULT_MAX_BODY_BYTES = 256 * 1024; // 256 KB

export type ParseError = { ok: false; response: NextResponse };
export type ParseOk<T> = { ok: true; value: T };
export type ParseResult<T> = ParseError | ParseOk<T>;

/**
 * Parse a JSON request body with a hard size cap. Reads Content-Length
 * first as a cheap pre-check, then falls through to actual parse. The
 * content-length header is client-controlled so we still need to defend
 * via the inner parse step (Next caps request body by default but make
 * this explicit so reviewers see the intent).
 */
export async function readJsonBody(
  req: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<ParseResult<unknown>> {
  const lenHeader = req.headers.get("content-length");
  if (lenHeader) {
    const n = Number.parseInt(lenHeader, 10);
    if (Number.isFinite(n) && n > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "payload_too_large" },
          { status: 413 },
        ),
      };
    }
  }
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "invalid_json" }, { status: 400 }),
    };
  }
  return { ok: true, value: parsed };
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Trim a string-shaped field, returning null when empty. Caps the length
 * so a malicious client can't insert a 50MB note via a body slot we forgot
 * to cap.
 */
export function cleanString(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

export function asEnum<T extends string>(
  v: unknown,
  allowed: ReadonlyArray<T>,
): T | null {
  if (typeof v !== "string") return null;
  return (allowed as ReadonlyArray<string>).includes(v) ? (v as T) : null;
}

/**
 * Validates that a value is a UUID v4-ish string. We never parse the
 * incoming `id` from the URL — Next gives us the raw path segment — so
 * routes that act on user-supplied IDs should call this before they
 * trust the value for log lines or downstream calls.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_REGEX.test(v);
}

/**
 * Standard JSON 429 response with a Retry-After header.
 */
export function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) },
    },
  );
}
