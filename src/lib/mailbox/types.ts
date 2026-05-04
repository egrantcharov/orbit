/**
 * Provider-agnostic mailbox interface. Today only Gmail is implemented;
 * Outlook (Microsoft Graph) lands in v3.5/v4 with the same shape.
 *
 * Route handlers depend on this type, never on the per-provider SDK.
 */

import type { MailboxProvider } from "@/lib/types/database";

export type DiscoveredParticipant = {
  email: string;
  name: string | null;
  role: "from" | "to" | "cc";
};

export type DiscoveredThread = {
  providerThreadId: string;
  subject: string | null;
  snippet: string | null;
  bodyExcerpt: string | null;
  lastMessageAt: string; // ISO
  hasUnsubscribe: boolean;
  replyTo: string | null;
  userParticipated: boolean;
  participants: DiscoveredParticipant[];
};

export type SearchByContactArgs = {
  clerkUserId: string;
  mailboxId: string;
  email: string;
  daysBack: number;
  maxThreads?: number;
};

export type SendEmailArgs = {
  clerkUserId: string;
  mailboxId: string;
  to: string;
  subject: string;
  body: string;
};

export type CreateCalendarEventArgs = {
  clerkUserId: string;
  mailboxId: string;
  summary: string;
  description?: string;
  startISO: string;
  durationMin: number;
  attendees: Array<{ email: string; displayName?: string }>;
};

export type SendEmailResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: "reconnect_required" | "send_failed"; message?: string };

export type CalendarEventResult =
  | { ok: true; htmlLink: string | null; eventId: string | null }
  | { ok: false; error: "reconnect_required" | "create_failed"; message?: string };

export interface MailboxAdapter {
  provider: MailboxProvider;
  searchByContact(args: SearchByContactArgs): Promise<DiscoveredThread[]>;
  sendEmail(args: SendEmailArgs): Promise<SendEmailResult>;
  createCalendarEvent(args: CreateCalendarEventArgs): Promise<CalendarEventResult>;
}
