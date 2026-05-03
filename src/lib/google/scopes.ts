// Required scopes for v2 features. Used by both the OAuth grant flow and the
// scope-mismatch detection that drives the Reconnect banner.
export const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

export function hasAllScopes(actual: string[] | null | undefined): boolean {
  if (!actual || actual.length === 0) return false;
  const set = new Set(actual);
  return REQUIRED_SCOPES.every((s) => set.has(s));
}

export function missingScopes(actual: string[] | null | undefined): string[] {
  if (!actual) return [...REQUIRED_SCOPES];
  const set = new Set(actual);
  return REQUIRED_SCOPES.filter((s) => !set.has(s));
}
