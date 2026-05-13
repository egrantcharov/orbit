/**
 * Single source of truth for Orbit MCP scopes.
 *
 * Every tool / prompt / resource declares which scopes it needs; the bearer
 * resolver carries the granted set onto the request context; the consent
 * screen renders the human-readable labels next to checkboxes.
 *
 * Add a new scope here, NOT inline in handlers, so the consent screen,
 * the README, and the type checker stay in sync.
 */

export type Scope =
  | "contacts:read"
  | "contacts:write"
  | "interactions:read"
  | "interactions:write"
  | "voice:read"
  | "voice:write"
  | "briefings:read"
  | "ai:invoke"
  | "*";

export const ALL_SCOPES: Scope[] = [
  "contacts:read",
  "contacts:write",
  "interactions:read",
  "interactions:write",
  "voice:read",
  "voice:write",
  "briefings:read",
  "ai:invoke",
];

export const SCOPE_LABELS: Record<Scope, { title: string; body: string }> = {
  "contacts:read": {
    title: "Read your contacts",
    body: "See names, companies, scores, notes, last-interaction timestamps, and AI relationship summaries.",
  },
  "contacts:write": {
    title: "Edit your contacts",
    body: "Update tags, notes, pin/archive state, and profile fields like company or job title.",
  },
  "interactions:read": {
    title: "Read your activity log",
    body: "See email threads, meeting attendance, manual notes, phone/iMessage logs.",
  },
  "interactions:write": {
    title: "Log new interactions",
    body: "Add notes, phone calls, iMessage threads against a contact.",
  },
  "voice:read": {
    title: "Read voice memos",
    body: "See transcripts and Claude-generated summaries + action items for your recorded calls.",
  },
  "voice:write": {
    title: "Save new voice transcripts",
    body: "Send pre-recorded transcript text to be summarized and stored as a voice memo.",
  },
  "briefings:read": {
    title: "Read your daily briefings",
    body: "See Today nudges, Synth digests, upcoming meeting briefs.",
  },
  "ai:invoke": {
    title: "Invoke Orbit's AI prompts",
    body: "Run draft-email, meeting-prep, relationship-summary, TLDR, and voice-memo-summary on demand.",
  },
  "*": {
    title: "Full access",
    body: "Equivalent to granting every other scope. Pick this only for trusted clients (e.g. your own scripts).",
  },
};

export function hasScope(granted: ReadonlyArray<string>, needed: Scope): boolean {
  if (granted.includes("*")) return true;
  return granted.includes(needed);
}

export function requireScope(
  granted: ReadonlyArray<string>,
  needed: Scope,
): void {
  if (!hasScope(granted, needed)) {
    throw new Error(
      `Missing required scope: ${needed}. This client has: ${granted.join(", ") || "(none)"}.`,
    );
  }
}

export function parseScopes(raw: string | string[] | null | undefined): Scope[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[\s,]+/).filter(Boolean)
      : [];
  const allowed: Set<Scope> = new Set([...ALL_SCOPES, "*"]);
  const out: Scope[] = [];
  for (const s of list) {
    if (allowed.has(s as Scope)) out.push(s as Scope);
  }
  return Array.from(new Set(out));
}
