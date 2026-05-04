// v3 scope contracts. Different surfaces require different scopes:
//   - Enrichment / digest / scoring: gmail.readonly
//   - Email send modal: gmail.send
//   - Calendar invite modal: calendar.events
// Each call site checks the relevant subset rather than a single
// monolithic "all scopes required" gate.

export const GMAIL_READ_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_SEND_SCOPE =
  "https://www.googleapis.com/auth/gmail.send";
export const CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

// Default — used by ReconnectGooglePrompt to decide if any v3 feature is
// missing scope. We treat all three as "the v3 starter pack" so a single
// reconnect upgrades you for everything.
export const REQUIRED_SCOPES = [
  GMAIL_READ_SCOPE,
  GMAIL_SEND_SCOPE,
  CALENDAR_EVENTS_SCOPE,
];

export const REQUIRED_GMAIL_READ_SCOPES = [GMAIL_READ_SCOPE];
export const REQUIRED_GMAIL_SEND_SCOPES = [GMAIL_SEND_SCOPE];
export const REQUIRED_CALENDAR_SCOPES = [CALENDAR_EVENTS_SCOPE];

export function hasAllScopes(
  actual: string[] | null | undefined,
  required: string[] = REQUIRED_SCOPES,
): boolean {
  if (!actual || actual.length === 0) return false;
  const set = new Set(actual);
  return required.every((s) => set.has(s));
}

export function missingScopes(
  actual: string[] | null | undefined,
  required: string[] = REQUIRED_SCOPES,
): string[] {
  if (!actual) return [...required];
  const set = new Set(actual);
  return required.filter((s) => !set.has(s));
}
