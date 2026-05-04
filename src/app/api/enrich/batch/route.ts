import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getAdapter } from "@/lib/mailbox";
import {
  hasAllScopes,
  REQUIRED_GMAIL_READ_SCOPES,
} from "@/lib/google/scopes";
import type { Database, MailboxProvider } from "@/lib/types/database";

export const maxDuration = 60;

const MAX_PER_REQUEST = 30;
const ENRICH_DAYS_BACK = 365;
const ENRICH_MAX_THREADS = 50;
const CONCURRENCY = 5;
const MIN_THREADS_FOR_AUTO_SCORE = 3;

type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];
type ThreadInsert = Database["public"]["Tables"]["threads"]["Insert"];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { contactIds?: unknown };
  try {
    body = (await req.json()) as { contactIds?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!Array.isArray(body.contactIds) || body.contactIds.length === 0) {
    return NextResponse.json({ error: "missing_contact_ids" }, { status: 400 });
  }
  if (body.contactIds.length > MAX_PER_REQUEST) {
    return NextResponse.json({ error: "too_many" }, { status: 413 });
  }
  const contactIds = body.contactIds.filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (contactIds.length === 0) {
    return NextResponse.json({ error: "no_valid_ids" }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();

  // Single-mailbox v3: pick the user's one Gmail row.
  const { data: mailbox } = await supabase
    .from("mailbox_connections")
    .select("id, provider, scopes")
    .eq("clerk_user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (!mailbox) {
    return NextResponse.json(
      { error: "no_mailbox", message: "Connect Gmail to enable enrichment." },
      { status: 400 },
    );
  }
  if (!hasAllScopes(mailbox.scopes, REQUIRED_GMAIL_READ_SCOPES)) {
    return NextResponse.json(
      {
        error: "reconnect_required",
        message: "Reconnect Gmail with read access to enable enrichment.",
      },
      { status: 400 },
    );
  }

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, email, display_name")
    .eq("clerk_user_id", userId)
    .in("id", contactIds);

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, scoredCandidates: [] });
  }

  const adapter = getAdapter(mailbox.provider as MailboxProvider);
  const scoredCandidates: string[] = [];
  let processed = 0;
  let totalThreadsFound = 0;

  // Run in concurrency-bounded waves so a 30-contact batch doesn't fan out
  // to 30 simultaneous Gmail queries.
  for (let i = 0; i < contacts.length; i += CONCURRENCY) {
    const wave = contacts.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      wave.map(async (c) => {
        if (!c.email) {
          await markState(supabase, userId, mailbox.id, c.id, "skipped", 0, "no_email");
          return { contactId: c.id, threadsFound: 0 };
        }
        await markState(supabase, userId, mailbox.id, c.id, "running", 0);
        try {
          const threads = await adapter.searchByContact({
            clerkUserId: userId,
            mailboxId: mailbox.id,
            email: c.email,
            daysBack: ENRICH_DAYS_BACK,
            maxThreads: ENRICH_MAX_THREADS,
          });

          let threadsFound = 0;
          if (threads.length > 0) {
            threadsFound = await persistThreads(
              supabase,
              userId,
              mailbox.id,
              c.id,
              threads,
            );
          }
          await markState(
            supabase,
            userId,
            mailbox.id,
            c.id,
            "done",
            threadsFound,
          );
          return { contactId: c.id, threadsFound };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await markState(
            supabase,
            userId,
            mailbox.id,
            c.id,
            "error",
            0,
            msg.slice(0, 500),
          );
          return { contactId: c.id, threadsFound: 0, error: msg };
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        processed += 1;
        totalThreadsFound += r.value.threadsFound;
        if (r.value.threadsFound >= MIN_THREADS_FOR_AUTO_SCORE) {
          scoredCandidates.push(r.value.contactId);
        }
      } else {
        processed += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    threadsFound: totalThreadsFound,
    scoredCandidates,
  });
}

async function markState(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  clerkUserId: string,
  mailboxId: string,
  contactId: string,
  status: "running" | "done" | "error" | "skipped",
  threadsFound: number,
  errorMessage?: string,
): Promise<void> {
  await supabase.from("enrichment_state").upsert(
    {
      clerk_user_id: clerkUserId,
      mailbox_id: mailboxId,
      contact_id: contactId,
      status,
      threads_found: threadsFound,
      last_run_at: new Date().toISOString(),
      error_message: errorMessage ?? null,
    },
    { onConflict: "mailbox_id,contact_id" },
  );
}

async function persistThreads(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  clerkUserId: string,
  mailboxId: string,
  primaryContactId: string,
  threads: Array<Awaited<ReturnType<typeof getAdapter>["searchByContact"] extends never ? never : never>> | // type-only, unused
    Array<{
      providerThreadId: string;
      subject: string | null;
      snippet: string | null;
      bodyExcerpt: string | null;
      lastMessageAt: string;
      hasUnsubscribe: boolean;
      replyTo: string | null;
      userParticipated: boolean;
      participants: Array<{ email: string; name: string | null; role: "from" | "to" | "cc" }>;
    }>,
): Promise<number> {
  const threadRows: ThreadInsert[] = threads.map((t) => ({
    clerk_user_id: clerkUserId,
    mailbox_id: mailboxId,
    provider_thread_id: t.providerThreadId,
    gmail_thread_id: t.providerThreadId, // legacy column kept populated
    subject: t.subject,
    snippet: t.snippet,
    body_excerpt: t.bodyExcerpt,
    has_unsubscribe: t.hasUnsubscribe,
    reply_to: t.replyTo,
    user_participated: t.userParticipated,
    last_message_at: t.lastMessageAt,
  }));

  const { error: threadErr } = await supabase
    .from("threads")
    .upsert(threadRows, {
      onConflict: "mailbox_id,provider_thread_id",
      ignoreDuplicates: false,
    });
  if (threadErr) throw threadErr;

  // Read back ids for participant linking.
  const providerIds = threads.map((t) => t.providerThreadId);
  const { data: persistedThreads } = await supabase
    .from("threads")
    .select("id, provider_thread_id")
    .eq("mailbox_id", mailboxId)
    .in("provider_thread_id", providerIds);
  const idByProviderId = new Map(
    (persistedThreads ?? []).map((r) => [r.provider_thread_id ?? "", r.id]),
  );

  // For every participant on every thread, look up an existing contact (or
  // create an unenrolled stub for orphan-rescue surfacing). Then link
  // thread_participants.
  const allEmails = new Set<string>();
  for (const t of threads) {
    for (const p of t.participants) allEmails.add(p.email.toLowerCase());
  }

  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, email")
    .eq("clerk_user_id", clerkUserId)
    .in("email", Array.from(allEmails));
  const contactIdByEmail = new Map<string, string>();
  for (const row of existingContacts ?? []) {
    if (row.email) contactIdByEmail.set(row.email.toLowerCase(), row.id);
  }

  // Always link the primary contact to its threads regardless of header
  // matches (the search query targeted them; their email may not appear
  // in From/To/Cc on every message, e.g. forwarded chains).
  const participantRows: Array<{
    thread_id: string;
    contact_id: string;
    role: "from" | "to" | "cc";
  }> = [];

  for (const t of threads) {
    const threadId = idByProviderId.get(t.providerThreadId);
    if (!threadId) continue;
    let primaryLinked = false;
    for (const p of t.participants) {
      const cid = contactIdByEmail.get(p.email.toLowerCase());
      if (!cid) continue;
      participantRows.push({ thread_id: threadId, contact_id: cid, role: p.role });
      if (cid === primaryContactId) primaryLinked = true;
    }
    if (!primaryLinked) {
      participantRows.push({
        thread_id: threadId,
        contact_id: primaryContactId,
        role: "to",
      });
    }
  }

  if (participantRows.length > 0) {
    await supabase.from("thread_participants").upsert(participantRows, {
      onConflict: "thread_id,contact_id,role",
      ignoreDuplicates: true,
    });
  }

  // Update derived fields on the primary contact.
  const lastIso = threads
    .map((t) => t.lastMessageAt)
    .sort()
    .reverse()[0];
  const userSent = threads.filter((t) => t.userParticipated).length;
  const updateContact: Database["public"]["Tables"]["contacts"]["Update"] = {
    last_interaction_at: lastIso,
    message_count: threads.length,
    user_sent_count: userSent,
  };
  await supabase
    .from("contacts")
    .update(updateContact)
    .eq("clerk_user_id", clerkUserId)
    .eq("id", primaryContactId);

  // Quietly create stub contacts for previously-unknown senders so the
  // orphan-rescue endpoint can surface them. Stubs get is_archived=true so
  // they don't pollute the People tab until the user adopts them.
  const unknownEmails = Array.from(allEmails).filter(
    (e) => !contactIdByEmail.has(e),
  );
  if (unknownEmails.length > 0) {
    // Find a display name from the first thread that mentioned each email.
    const nameByEmail = new Map<string, string | null>();
    for (const t of threads) {
      for (const p of t.participants) {
        const lc = p.email.toLowerCase();
        if (!nameByEmail.has(lc)) nameByEmail.set(lc, p.name);
      }
    }
    const stubs: ContactInsert[] = unknownEmails.map((e) => ({
      clerk_user_id: clerkUserId,
      email: e,
      display_name: nameByEmail.get(e) ?? null,
      source: "gmail",
      is_archived: true, // hidden until user explicitly adopts
    }));
    await supabase
      .from("contacts")
      .upsert(stubs, { onConflict: "clerk_user_id,email", ignoreDuplicates: true });
  }

  return threads.length;
}
