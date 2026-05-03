import { google } from "googleapis";
import { getAuthClient } from "@/lib/google/auth";
import { hasAllScopes } from "@/lib/google/scopes";

export type SendEmailInput = {
  clerkUserId: string;
  to: string;
  subject: string;
  body: string; // plain text
};

function encodeRfc2047(s: string): string {
  // If subject is pure ASCII, keep it; otherwise encode as MIME B-encoding.
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const b64 = Buffer.from(s, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function buildMime(from: string, to: string, subject: string, body: string): string {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeRfc2047(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  return headers.join("\r\n") + "\r\n\r\n" + body;
}

function base64Url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: "reconnect_required" };

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const { oauth2, googleEmail, scopes } = await getAuthClient(input.clerkUserId);
  if (!hasAllScopes(scopes)) {
    return { ok: false, error: "reconnect_required" };
  }
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const raw = base64Url(buildMime(googleEmail, input.to, input.subject, input.body));
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return { ok: true, messageId: res.data.id ?? null };
}
