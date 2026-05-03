import { google } from "googleapis";

// v2 scopes. Re-consent required to upgrade from v1 (which used
// gmail.metadata + calendar.readonly). See `scopes.ts` for the helper that
// detects scope mismatch and triggers the reconnect banner.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
  "profile",
];

export function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URI!,
  );
}
