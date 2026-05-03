import { google, gmail_v1 } from "googleapis";
import { getAuthClient } from "@/lib/google/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ContactKind } from "@/lib/types/database";
import { heuristicClassify } from "@/lib/classify/heuristics";

const MAX_MESSAGES = 500;
const RECENT_DAYS = 30;
const RECENT_CUTOFF_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;
const BODY_EXCERPT_MAX = 2000;

type ParsedAddress = { name: string | null; email: string };

function parseAddresses(headerValue: string | undefined): ParsedAddress[] {
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

function headerValue(
  msg: gmail_v1.Schema$Message,
  name: string,
): string | undefined {
  const h = msg.payload?.headers?.find(
    (x) => x.name?.toLowerCase() === name.toLowerCase(),
  );
  return h?.value ?? undefined;
}

function decodeBase64Url(data: string): string {
  const buf = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return buf.toString("utf8");
}

function htmlToText(html: string): string {
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

// Walk the MIME tree looking for the best body candidate. Prefer text/plain;
// fall back to a stripped text/html. Returns null if nothing usable found.
function extractBodyText(payload: gmail_v1.Schema$MessagePart | undefined): string | null {
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

export async function syncRecentMessages(clerkUserId: string) {
  const supabase = createSupabaseServiceClient();
  const { oauth2, googleEmail } = await getAuthClient(clerkUserId);
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const selfEmail = googleEmail.toLowerCase();

  // gmail.readonly accepts `q` — keep the unqualified list to mirror v1
  // behaviour (newest 500 across all categories), filter date-side below.
  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults: MAX_MESSAGES,
  });
  const messageIds = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);

  if (messageIds.length === 0) {
    await supabase
      .from("google_connections")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("clerk_user_id", clerkUserId);
    return { messagesScanned: 0, contactsUpserted: 0, threadsUpserted: 0 };
  }

  // Fetch full messages in parallel batches of 25. `format=full` gives us
  // body parts; we drop them after extracting a single 2 KB excerpt per thread.
  const messages: gmail_v1.Schema$Message[] = [];
  for (let i = 0; i < messageIds.length; i += 25) {
    const slice = messageIds.slice(i, i + 25);
    const fetched = await Promise.all(
      slice.map((id) =>
        gmail.users.messages
          .get({
            userId: "me",
            id,
            format: "full",
          })
          .then((r) => r.data),
      ),
    );
    messages.push(...fetched);
  }

  // Aggregate contacts: email -> rich record.
  type ContactAgg = {
    email: string;
    displayName: string | null;
    lastSeen: Date;
    count: number;
    hasUnsubscribe: boolean;
    userSentCount: number;
    userRepliedCount: number;
  };
  const contactByEmail = new Map<string, ContactAgg>();

  // Aggregate threads.
  type ThreadAgg = {
    gmailThreadId: string;
    subject: string | null;
    snippet: string | null;
    lastMessageAt: Date;
    participants: Map<string, "from" | "to" | "cc">;
    hasUnsubscribe: boolean;
    replyTo: string | null;
    userParticipated: boolean;
    bodyExcerpt: string | null;
  };
  const threadById = new Map<string, ThreadAgg>();

  const cutoffMs = Date.now() - RECENT_CUTOFF_MS;
  for (const msg of messages) {
    if (!msg.threadId || !msg.id) continue;
    const dateRaw = headerValue(msg, "Date");
    const date = dateRaw ? new Date(dateRaw) : new Date();
    if (date.getTime() < cutoffMs) continue;
    const subject = headerValue(msg, "Subject") ?? null;
    const snippet = msg.snippet ?? null;
    const listUnsub = headerValue(msg, "List-Unsubscribe");
    const replyTo = headerValue(msg, "Reply-To") ?? null;
    const inReplyTo = headerValue(msg, "In-Reply-To") ?? null;
    const messageHasUnsub = !!listUnsub;

    const fromAddrs = parseAddresses(headerValue(msg, "From"));
    const toAddrs = parseAddresses(headerValue(msg, "To"));
    const ccAddrs = parseAddresses(headerValue(msg, "Cc"));

    // Did the user participate in this message? (they're From, or in To/Cc)
    const fromIsSelf = fromAddrs.some((a) => a.email === selfEmail);
    const recipientIsSelf =
      toAddrs.some((a) => a.email === selfEmail) ||
      ccAddrs.some((a) => a.email === selfEmail);
    const userParticipatedHere = fromIsSelf || recipientIsSelf;

    const allContactAddrs: Array<{ addr: ParsedAddress; role: "from" | "to" | "cc" }> = [
      ...fromAddrs.map((a) => ({ addr: a, role: "from" as const })),
      ...toAddrs.map((a) => ({ addr: a, role: "to" as const })),
      ...ccAddrs.map((a) => ({ addr: a, role: "cc" as const })),
    ].filter(({ addr }) => addr.email !== selfEmail);

    for (const { addr, role } of allContactAddrs) {
      const existing = contactByEmail.get(addr.email);
      // user_sent_count = times user sent TO this contact (selfEmail in From,
      // contact in To/Cc/Bcc — for our purposes, contact appears as to/cc).
      // user_replied_count = same but only when the message is a reply
      // (In-Reply-To is set), which approximates "user wrote back to them".
      const sentInc =
        fromIsSelf && (role === "to" || role === "cc") ? 1 : 0;
      const repliedInc = sentInc && inReplyTo ? 1 : 0;
      if (existing) {
        existing.count += 1;
        if (addr.name && !existing.displayName) existing.displayName = addr.name;
        if (date > existing.lastSeen) existing.lastSeen = date;
        if (messageHasUnsub) existing.hasUnsubscribe = true;
        existing.userSentCount += sentInc;
        existing.userRepliedCount += repliedInc;
      } else {
        contactByEmail.set(addr.email, {
          email: addr.email,
          displayName: addr.name,
          lastSeen: date,
          count: 1,
          hasUnsubscribe: messageHasUnsub,
          userSentCount: sentInc,
          userRepliedCount: repliedInc,
        });
      }
    }

    const tAgg = threadById.get(msg.threadId);
    // Decide if we want to keep a body excerpt for this thread. Only worth
    // the storage/tokens when (a) it's bulk mail (digest needs the body) or
    // (b) the user is in the conversation (summary/scoring need context).
    const wantBody = messageHasUnsub || userParticipatedHere;
    let extractedBody: string | null = null;
    if (wantBody) {
      const text = extractBodyText(msg.payload ?? undefined);
      if (text) extractedBody = text.slice(0, BODY_EXCERPT_MAX);
    }

    if (tAgg) {
      if (date > tAgg.lastMessageAt) {
        tAgg.lastMessageAt = date;
        tAgg.subject = subject ?? tAgg.subject;
        tAgg.snippet = snippet ?? tAgg.snippet;
      }
      for (const { addr, role } of allContactAddrs) {
        if (!tAgg.participants.has(addr.email)) {
          tAgg.participants.set(addr.email, role);
        }
      }
      if (messageHasUnsub) tAgg.hasUnsubscribe = true;
      if (replyTo && !tAgg.replyTo) tAgg.replyTo = replyTo;
      if (userParticipatedHere) tAgg.userParticipated = true;
      // Prefer the longest body excerpt seen across the thread.
      if (extractedBody && (!tAgg.bodyExcerpt || extractedBody.length > tAgg.bodyExcerpt.length)) {
        tAgg.bodyExcerpt = extractedBody;
      }
    } else {
      const participants = new Map<string, "from" | "to" | "cc">();
      for (const { addr, role } of allContactAddrs) {
        participants.set(addr.email, role);
      }
      threadById.set(msg.threadId, {
        gmailThreadId: msg.threadId,
        subject,
        snippet,
        lastMessageAt: date,
        participants,
        hasUnsubscribe: messageHasUnsub,
        replyTo,
        userParticipated: userParticipatedHere,
        bodyExcerpt: extractedBody,
      });
    }
  }

  // Pre-read existing contacts to preserve user-locked classifications and
  // any prior LLM-assigned kinds the heuristic can't decide on.
  const emails = Array.from(contactByEmail.keys());
  const existingByEmail = new Map<
    string,
    {
      kind: ContactKind;
      kind_reason: string | null;
      kind_locked: boolean;
      is_hidden: boolean;
    }
  >();
  if (emails.length > 0) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("email, kind, kind_reason, kind_locked, is_hidden")
      .eq("clerk_user_id", clerkUserId)
      .in("email", emails);
    for (const row of existing ?? []) {
      if (!row.email) continue;
      existingByEmail.set(row.email, {
        kind: row.kind,
        kind_reason: row.kind_reason,
        kind_locked: row.kind_locked,
        is_hidden: row.is_hidden,
      });
    }
  }

  // Bulk upsert contacts (with heuristic classification).
  const contactRows = Array.from(contactByEmail.values()).map((c) => {
    const ex = existingByEmail.get(c.email);
    const heuristic = heuristicClassify({
      email: c.email,
      displayName: c.displayName,
      messageCount: c.count,
      hasUnsubscribe: c.hasUnsubscribe,
      userRepliedCount: c.userRepliedCount,
      userSentCount: c.userSentCount,
    });

    let kind: ContactKind;
    let kind_reason: string | null;
    let is_hidden: boolean;
    if (ex?.kind_locked) {
      // User override wins forever — never reclassify or rehide.
      kind = ex.kind;
      kind_reason = ex.kind_reason;
      is_hidden = ex.is_hidden;
    } else if (heuristic) {
      kind = heuristic.kind;
      kind_reason = heuristic.reason;
      // Only auto-hide on the *first* heuristic pass for this kind. If the
      // contact is already known and visible, don't surprise-hide it.
      is_hidden = ex ? ex.is_hidden : heuristic.isHidden;
      if (!ex && heuristic.isHidden) is_hidden = true;
    } else if (ex && ex.kind !== "unknown") {
      kind = ex.kind;
      kind_reason = ex.kind_reason;
      is_hidden = ex.is_hidden;
    } else {
      kind = "unknown";
      kind_reason = null;
      is_hidden = ex?.is_hidden ?? false;
    }

    return {
      clerk_user_id: clerkUserId,
      email: c.email,
      display_name: c.displayName,
      last_interaction_at: c.lastSeen.toISOString(),
      message_count: c.count,
      kind,
      kind_reason,
      is_hidden,
      user_sent_count: c.userSentCount,
      user_replied_count: c.userRepliedCount,
    };
  });

  if (contactRows.length > 0) {
    const { error: contactErr } = await supabase
      .from("contacts")
      .upsert(contactRows, { onConflict: "clerk_user_id,email" });
    if (contactErr) throw contactErr;
  }

  // Read back contact ids so we can link thread_participants. Email-only
  // map is fine here — LinkedIn-only rows (email=null) have no thread
  // participation.
  const { data: contactIdRows, error: readErr } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("clerk_user_id", clerkUserId)
    .not("email", "is", null);
  if (readErr) throw readErr;
  const contactIdByEmail = new Map(
    (contactIdRows ?? [])
      .filter((r): r is { id: string; email: string } => !!r.email)
      .map((r) => [r.email, r.id]),
  );

  // Bulk upsert threads.
  const threadRows = Array.from(threadById.values()).map((t) => ({
    clerk_user_id: clerkUserId,
    gmail_thread_id: t.gmailThreadId,
    subject: t.subject,
    snippet: t.snippet,
    last_message_at: t.lastMessageAt.toISOString(),
    body_excerpt: t.bodyExcerpt,
    has_unsubscribe: t.hasUnsubscribe,
    reply_to: t.replyTo,
    user_participated: t.userParticipated,
  }));

  if (threadRows.length > 0) {
    const { error: threadErr } = await supabase
      .from("threads")
      .upsert(threadRows, { onConflict: "clerk_user_id,gmail_thread_id" });
    if (threadErr) throw threadErr;
  }

  // Read back thread ids.
  const { data: threadIdRows, error: tReadErr } = await supabase
    .from("threads")
    .select("id, gmail_thread_id")
    .eq("clerk_user_id", clerkUserId);
  if (tReadErr) throw tReadErr;
  const threadIdByGmailId = new Map(
    (threadIdRows ?? []).map((r) => [r.gmail_thread_id, r.id]),
  );

  // Build thread_participants rows.
  const participantRows: Array<{
    thread_id: string;
    contact_id: string;
    role: "from" | "to" | "cc";
  }> = [];
  for (const t of threadById.values()) {
    const threadId = threadIdByGmailId.get(t.gmailThreadId);
    if (!threadId) continue;
    for (const [email, role] of t.participants) {
      const contactId = contactIdByEmail.get(email);
      if (!contactId) continue;
      participantRows.push({ thread_id: threadId, contact_id: contactId, role });
    }
  }

  if (participantRows.length > 0) {
    const { error: partErr } = await supabase
      .from("thread_participants")
      .upsert(participantRows, {
        onConflict: "thread_id,contact_id,role",
        ignoreDuplicates: true,
      });
    if (partErr) throw partErr;
  }

  await supabase
    .from("google_connections")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("clerk_user_id", clerkUserId);

  return {
    messagesScanned: messages.length,
    contactsUpserted: contactRows.length,
    threadsUpserted: threadRows.length,
  };
}

// Re-export so callers that imported from `gmail/sync` continue to compile.
// Send/calendar routes should prefer the canonical `lib/google/auth` path.
export { getAuthClient } from "@/lib/google/auth";
