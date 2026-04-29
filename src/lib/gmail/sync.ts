import { google, gmail_v1 } from "googleapis";
import { createOAuth2Client } from "@/lib/google/oauth";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { ContactKind, Database } from "@/lib/types/database";
import { heuristicClassify } from "@/lib/classify/heuristics";

const MAX_MESSAGES = 500;
const RECENT_DAYS = 30;
const RECENT_CUTOFF_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;

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

async function getAuthClient(clerkUserId: string) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("google_connections")
    .select("*")
    .eq("clerk_user_id", clerkUserId)
    .single();
  if (error || !data) {
    throw new Error("No Google connection for user");
  }

  const oauth2 = createOAuth2Client();
  const refreshToken = decryptToken(data.refresh_token_encrypted);
  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: data.access_token ?? undefined,
    expiry_date: data.access_token_expires_at
      ? new Date(data.access_token_expires_at).getTime()
      : undefined,
  });

  // Persist any refreshed credentials so we don't pay the refresh cost on
  // every call.
  oauth2.on("tokens", async (tokens) => {
    const update: Database["public"]["Tables"]["google_connections"]["Update"] = {};
    if (tokens.access_token) update.access_token = tokens.access_token;
    if (tokens.expiry_date) {
      update.access_token_expires_at = new Date(tokens.expiry_date).toISOString();
    }
    if (tokens.refresh_token) {
      update.refresh_token_encrypted = encryptToken(tokens.refresh_token);
    }
    if (Object.keys(update).length > 0) {
      await supabase
        .from("google_connections")
        .update(update)
        .eq("clerk_user_id", clerkUserId);
    }
  });

  return { oauth2, googleEmail: data.google_email };
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

export async function syncRecentMessages(clerkUserId: string) {
  const supabase = createSupabaseServiceClient();
  const { oauth2, googleEmail } = await getAuthClient(clerkUserId);
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const selfEmail = googleEmail.toLowerCase();

  // The gmail.metadata scope rejects the `q` parameter, so we list the
  // newest MAX_MESSAGES across the account (newest first by default) and
  // filter to the last RECENT_DAYS in the processing loop below.
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

  // Fetch metadata for all messages in parallel batches of 25.
  const messages: gmail_v1.Schema$Message[] = [];
  for (let i = 0; i < messageIds.length; i += 25) {
    const slice = messageIds.slice(i, i + 25);
    const fetched = await Promise.all(
      slice.map((id) =>
        gmail.users.messages
          .get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
          })
          .then((r) => r.data),
      ),
    );
    messages.push(...fetched);
  }

  // Aggregate contacts: email -> {display_name, last_seen, count}
  type ContactAgg = {
    email: string;
    displayName: string | null;
    lastSeen: Date;
    count: number;
  };
  const contactByEmail = new Map<string, ContactAgg>();

  // Aggregate threads: gmail_thread_id -> {subject, snippet, last_message_at, participants[]}
  type ThreadAgg = {
    gmailThreadId: string;
    subject: string | null;
    snippet: string | null;
    lastMessageAt: Date;
    participants: Map<string, "from" | "to" | "cc">;
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

    const fromAddrs = parseAddresses(headerValue(msg, "From"));
    const toAddrs = parseAddresses(headerValue(msg, "To"));
    const ccAddrs = parseAddresses(headerValue(msg, "Cc"));

    const allContactAddrs: Array<{ addr: ParsedAddress; role: "from" | "to" | "cc" }> = [
      ...fromAddrs.map((a) => ({ addr: a, role: "from" as const })),
      ...toAddrs.map((a) => ({ addr: a, role: "to" as const })),
      ...ccAddrs.map((a) => ({ addr: a, role: "cc" as const })),
    ].filter(({ addr }) => addr.email !== selfEmail);

    for (const { addr } of allContactAddrs) {
      const existing = contactByEmail.get(addr.email);
      if (existing) {
        existing.count += 1;
        if (addr.name && !existing.displayName) existing.displayName = addr.name;
        if (date > existing.lastSeen) existing.lastSeen = date;
      } else {
        contactByEmail.set(addr.email, {
          email: addr.email,
          displayName: addr.name,
          lastSeen: date,
          count: 1,
        });
      }
    }

    const tAgg = threadById.get(msg.threadId);
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
      });
    }
  }

  // Pre-read existing contacts so we can: preserve user-locked kind/reason
  // verbatim; preserve LLM-assigned kinds (kind != 'unknown') that the
  // heuristic doesn't have an opinion on; and only overwrite kinds when the
  // heuristic now has a stronger opinion.
  const emails = Array.from(contactByEmail.keys());
  const existingByEmail = new Map<
    string,
    {
      kind: ContactKind;
      kind_reason: string | null;
      kind_locked: boolean;
    }
  >();
  if (emails.length > 0) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("email, kind, kind_reason, kind_locked")
      .eq("clerk_user_id", clerkUserId)
      .in("email", emails);
    for (const row of existing ?? []) {
      existingByEmail.set(row.email, {
        kind: row.kind,
        kind_reason: row.kind_reason,
        kind_locked: row.kind_locked,
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
    });

    let kind: ContactKind;
    let kind_reason: string | null;
    if (ex?.kind_locked) {
      // User override wins forever — never reclassify.
      kind = ex.kind;
      kind_reason = ex.kind_reason;
    } else if (heuristic) {
      kind = heuristic.kind;
      kind_reason = heuristic.reason;
    } else if (ex && ex.kind !== "unknown") {
      // Heuristic has no opinion but the LLM (or a previous heuristic
      // version) already classified this contact — keep that.
      kind = ex.kind;
      kind_reason = ex.kind_reason;
    } else {
      kind = "unknown";
      kind_reason = null;
    }

    return {
      clerk_user_id: clerkUserId,
      email: c.email,
      display_name: c.displayName,
      last_interaction_at: c.lastSeen.toISOString(),
      message_count: c.count,
      kind,
      kind_reason,
    };
  });

  if (contactRows.length > 0) {
    const { error: contactErr } = await supabase
      .from("contacts")
      .upsert(contactRows, { onConflict: "clerk_user_id,email" });
    if (contactErr) throw contactErr;
  }

  // Read back contact ids so we can link thread_participants.
  const { data: contactIdRows, error: readErr } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("clerk_user_id", clerkUserId);
  if (readErr) throw readErr;
  const contactIdByEmail = new Map(
    (contactIdRows ?? []).map((r) => [r.email, r.id]),
  );

  // Bulk upsert threads.
  const threadRows = Array.from(threadById.values()).map((t) => ({
    clerk_user_id: clerkUserId,
    gmail_thread_id: t.gmailThreadId,
    subject: t.subject,
    snippet: t.snippet,
    last_message_at: t.lastMessageAt.toISOString(),
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
