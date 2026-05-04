import { google, gmail_v1 } from "googleapis";
import { getAuthClient } from "@/lib/google/auth";
import { hasAllScopes, REQUIRED_GMAIL_READ_SCOPES, REQUIRED_GMAIL_SEND_SCOPES, REQUIRED_CALENDAR_SCOPES } from "@/lib/google/scopes";
import {
  parseAddresses,
  extractBodyText,
  headerValue,
  type ParsedAddress,
} from "@/lib/mailbox/parse";
import type {
  MailboxAdapter,
  SearchByContactArgs,
  SendEmailArgs,
  SendEmailResult,
  CreateCalendarEventArgs,
  CalendarEventResult,
  DiscoveredThread,
  DiscoveredParticipant,
} from "@/lib/mailbox/types";

const BODY_EXCERPT_MAX = 2000;

function encodeRfc2047(s: string): string {
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function buildMime(from: string, to: string, subject: string, body: string): string {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeRfc2047(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ].join("\r\n") + "\r\n\r\n" + body;
}

function base64Url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function summarizeThread(
  thread: gmail_v1.Schema$Thread,
  selfEmail: string,
): DiscoveredThread | null {
  const messages = thread.messages ?? [];
  if (messages.length === 0 || !thread.id) return null;

  let subject: string | null = null;
  let snippet: string | null = null;
  let bodyExcerpt: string | null = null;
  let lastMessageAt: string = new Date(0).toISOString();
  let hasUnsubscribe = false;
  let replyTo: string | null = null;
  let userParticipated = false;

  const participants = new Map<string, DiscoveredParticipant>();

  for (const msg of messages) {
    if (!subject) subject = headerValue(msg, "Subject") ?? null;
    if (!snippet) snippet = msg.snippet ?? null;
    const dateStr = headerValue(msg, "Date");
    const date = dateStr ? new Date(dateStr) : null;
    if (date && !Number.isNaN(date.getTime())) {
      const iso = date.toISOString();
      if (iso > lastMessageAt) lastMessageAt = iso;
    }
    if (headerValue(msg, "List-Unsubscribe")) hasUnsubscribe = true;
    if (!replyTo) replyTo = headerValue(msg, "Reply-To") ?? null;

    const fromAddrs = parseAddresses(headerValue(msg, "From"));
    const toAddrs = parseAddresses(headerValue(msg, "To"));
    const ccAddrs = parseAddresses(headerValue(msg, "Cc"));

    if (fromAddrs.some((a) => a.email === selfEmail) ||
        toAddrs.some((a) => a.email === selfEmail) ||
        ccAddrs.some((a) => a.email === selfEmail)) {
      userParticipated = true;
    }

    const roles: Array<{ list: ParsedAddress[]; role: DiscoveredParticipant["role"] }> = [
      { list: fromAddrs, role: "from" },
      { list: toAddrs, role: "to" },
      { list: ccAddrs, role: "cc" },
    ];
    for (const { list, role } of roles) {
      for (const a of list) {
        if (a.email === selfEmail) continue;
        if (!participants.has(a.email)) {
          participants.set(a.email, { email: a.email, name: a.name, role });
        }
      }
    }

    // Try to extract a body excerpt; prefer the longest one across the thread.
    const text = extractBodyText(msg.payload ?? undefined);
    if (text) {
      const trimmed = text.slice(0, BODY_EXCERPT_MAX);
      if (!bodyExcerpt || trimmed.length > bodyExcerpt.length) {
        bodyExcerpt = trimmed;
      }
    }
  }

  if (lastMessageAt === new Date(0).toISOString()) {
    lastMessageAt = new Date().toISOString();
  }

  return {
    providerThreadId: thread.id,
    subject,
    snippet,
    bodyExcerpt,
    lastMessageAt,
    hasUnsubscribe,
    replyTo,
    userParticipated,
    participants: Array.from(participants.values()),
  };
}

async function ensureScopes(scopes: string[], required: string[]): Promise<boolean> {
  return hasAllScopes(scopes, required);
}

export const gmailAdapter: MailboxAdapter = {
  provider: "gmail",

  async searchByContact(args: SearchByContactArgs): Promise<DiscoveredThread[]> {
    const { oauth2, googleEmail, scopes } = await getAuthClient(args.clerkUserId);
    if (!(await ensureScopes(scopes, REQUIRED_GMAIL_READ_SCOPES))) {
      throw Object.assign(new Error("reconnect_required"), { reason: "reconnect_required" });
    }
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const selfEmail = googleEmail.toLowerCase();
    const target = args.email.toLowerCase();
    const days = Math.max(1, Math.min(3650, args.daysBack));
    const maxThreads = args.maxThreads ?? 50;

    const q = `(from:${target} OR to:${target} OR cc:${target}) newer_than:${days}d`;
    const list = await gmail.users.threads.list({
      userId: "me",
      q,
      maxResults: maxThreads,
    });

    const threadIds = (list.data.threads ?? []).map((t) => t.id!).filter(Boolean);
    if (threadIds.length === 0) return [];

    const out: DiscoveredThread[] = [];
    // Parallel batches of 5 — friendly to Gmail's per-user quota.
    for (let i = 0; i < threadIds.length; i += 5) {
      const slice = threadIds.slice(i, i + 5);
      const fetched = await Promise.all(
        slice.map((id) =>
          gmail.users.threads
            .get({ userId: "me", id, format: "full" })
            .then((r) => r.data)
            .catch(() => null),
        ),
      );
      for (const t of fetched) {
        if (!t) continue;
        const summary = summarizeThread(t, selfEmail);
        if (summary) out.push(summary);
      }
    }
    return out;
  },

  async sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
    const { oauth2, googleEmail, scopes } = await getAuthClient(args.clerkUserId);
    if (!(await ensureScopes(scopes, REQUIRED_GMAIL_SEND_SCOPES))) {
      return { ok: false, error: "reconnect_required" };
    }
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    try {
      const raw = base64Url(buildMime(googleEmail, args.to, args.subject, args.body));
      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
      return { ok: true, messageId: res.data.id ?? null };
    } catch (err) {
      return {
        ok: false,
        error: "send_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async createCalendarEvent(args: CreateCalendarEventArgs): Promise<CalendarEventResult> {
    const { oauth2, scopes } = await getAuthClient(args.clerkUserId);
    if (!(await ensureScopes(scopes, REQUIRED_CALENDAR_SCOPES))) {
      return { ok: false, error: "reconnect_required" };
    }
    const cal = google.calendar({ version: "v3", auth: oauth2 });
    try {
      const startDate = new Date(args.startISO);
      const endDate = new Date(startDate.getTime() + args.durationMin * 60_000);
      const res = await cal.events.insert({
        calendarId: "primary",
        sendUpdates: "all",
        requestBody: {
          summary: args.summary.slice(0, 300),
          description: args.description?.slice(0, 4000),
          start: { dateTime: startDate.toISOString() },
          end: { dateTime: endDate.toISOString() },
          attendees: args.attendees.map((a) => ({
            email: a.email,
            displayName: a.displayName,
          })),
        },
      });
      return {
        ok: true,
        htmlLink: res.data.htmlLink ?? null,
        eventId: res.data.id ?? null,
      };
    } catch (err) {
      return {
        ok: false,
        error: "create_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
