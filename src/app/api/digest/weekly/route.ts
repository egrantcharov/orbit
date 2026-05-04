import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { weeklyDigest, type DigestItem } from "@/lib/anthropic/digest";

export const maxDuration = 60;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supabase = createSupabaseServiceClient();

  const weekStart = mondayOf(new Date());

  const { data: existing } = await supabase
    .from("digests")
    .select("body, contacts_in, threads_in, created_at, week_start")
    .eq("clerk_user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (existing) {
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return NextResponse.json({
        ok: true,
        cached: true,
        weekStart,
        body: existing.body,
        contactsIn: existing.contacts_in,
        threadsIn: existing.threads_in,
      });
    }
  }

  // v3: source threads directly. Bulk-mail signal = List-Unsubscribe header
  // present + user never participated. Independent of contact classification
  // (kind enum is deprecated).
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: threads } = await supabase
    .from("threads")
    .select("id, subject, body_excerpt, snippet, last_message_at, reply_to")
    .eq("clerk_user_id", userId)
    .eq("has_unsubscribe", true)
    .eq("user_participated", false)
    .gte("last_message_at", cutoff)
    .not("subject", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (!threads || threads.length === 0) {
    return NextResponse.json({
      ok: true,
      weekStart,
      body:
        "_No newsletter activity in the past 7 days. Connect Gmail and run Enrich, then check back._",
      contactsIn: 0,
      threadsIn: 0,
    });
  }

  // Collect "from" addresses for naming purposes via thread_participants.
  const threadIds = threads.map((t) => t.id);
  const { data: participantRows } = await supabase
    .from("thread_participants")
    .select("thread_id, contact_id, role")
    .in("thread_id", threadIds)
    .eq("role", "from");

  const contactIds = Array.from(
    new Set((participantRows ?? []).map((p) => p.contact_id)),
  );
  const { data: contacts } = contactIds.length
    ? await supabase
        .from("contacts")
        .select("id, email, display_name")
        .in("id", contactIds)
    : { data: [] };
  const contactById = new Map(
    (contacts ?? []).map((c) => [c.id, c.display_name ?? c.email ?? ""]),
  );
  const fromByThread = new Map<string, string>();
  for (const p of participantRows ?? []) {
    if (!fromByThread.has(p.thread_id)) {
      const name = contactById.get(p.contact_id);
      if (name) fromByThread.set(p.thread_id, name);
    }
  }

  const items: DigestItem[] = threads
    .filter((t) => t.last_message_at && t.subject)
    .map((t) => ({
      from:
        fromByThread.get(t.id) ?? t.reply_to ?? "(unknown sender)",
      subject: t.subject!,
      body: t.body_excerpt ?? t.snippet ?? null,
      date: t.last_message_at!,
    }));

  const distinctSenders = new Set(items.map((it) => it.from)).size;

  try {
    const body = await weeklyDigest(items);

    await supabase.from("digests").upsert(
      {
        clerk_user_id: userId,
        week_start: weekStart,
        body,
        contacts_in: distinctSenders,
        threads_in: items.length,
        created_at: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id,week_start" },
    );

    return NextResponse.json({
      ok: true,
      weekStart,
      body,
      contactsIn: distinctSenders,
      threadsIn: items.length,
    });
  } catch (err) {
    console.error("digest failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "digest_failed" }, { status: 500 });
  }
}
