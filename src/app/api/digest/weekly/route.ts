import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { weeklyDigest, type DigestItem } from "@/lib/anthropic/digest";

export const maxDuration = 60;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0..6 (0 = Sun)
  const diff = (day + 6) % 7; // days since Monday
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

  // Return cached digest if it's < 1h old.
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

  // Pull newsletter contacts.
  const { data: newsletters } = await supabase
    .from("contacts")
    .select("id, email, display_name")
    .eq("clerk_user_id", userId)
    .eq("kind", "newsletter");

  const ids = (newsletters ?? []).map((n) => n.id);
  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      weekStart,
      body: "_No newsletters yet. Mark a few contacts as 'newsletter' or wait for the next sync._",
      contactsIn: 0,
      threadsIn: 0,
    });
  }
  const nameByEmail = new Map(
    (newsletters ?? []).map((n) => [n.email, n.display_name ?? n.email]),
  );

  // Pull threads from those contacts in the last 7 days.
  const { data: links } = await supabase
    .from("thread_participants")
    .select("thread_id, contact_id")
    .in("contact_id", ids);

  const contactByThread = new Map<string, string>();
  for (const l of links ?? []) {
    if (!contactByThread.has(l.thread_id)) {
      contactByThread.set(l.thread_id, l.contact_id);
    }
  }
  const threadIds = Array.from(contactByThread.keys());
  if (threadIds.length === 0) {
    return NextResponse.json({
      ok: true,
      weekStart,
      body: "_No newsletter activity yet. Try again after a few syncs._",
      contactsIn: ids.length,
      threadsIn: 0,
    });
  }

  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: threads } = await supabase
    .from("threads")
    .select("id, subject, snippet, last_message_at")
    .eq("clerk_user_id", userId)
    .in("id", threadIds)
    .gte("last_message_at", cutoff)
    .order("last_message_at", { ascending: false });

  if (!threads || threads.length === 0) {
    return NextResponse.json({
      ok: true,
      weekStart,
      body: "_No newsletter activity in the past 7 days. Try again next week._",
      contactsIn: ids.length,
      threadsIn: 0,
    });
  }

  const contactById = new Map(
    (newsletters ?? []).map((n) => [n.id, n.email]),
  );
  const items: DigestItem[] = threads
    .filter((t) => t.last_message_at && t.subject)
    .map((t) => {
      const contactId = contactByThread.get(t.id);
      const contactEmail = contactId ? contactById.get(contactId) ?? "" : "";
      const fromName = contactEmail ? nameByEmail.get(contactEmail) ?? contactEmail : "";
      return {
        from: fromName,
        subject: t.subject!,
        snippet: t.snippet,
        date: t.last_message_at!,
      };
    });

  try {
    const body = await weeklyDigest(items);

    await supabase.from("digests").upsert(
      {
        clerk_user_id: userId,
        week_start: weekStart,
        body,
        contacts_in: ids.length,
        threads_in: items.length,
        created_at: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id,week_start" },
    );

    return NextResponse.json({
      ok: true,
      weekStart,
      body,
      contactsIn: ids.length,
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
