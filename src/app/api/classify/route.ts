import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { classifyBatch, type ClassifyTarget } from "@/lib/classify/llm";

export const maxDuration = 60;

const MAX_PER_CALL = 200;
const BATCH_SIZE = 50;

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();

  // Pull contacts that the heuristic punted on. Order by message_count so the
  // most-active ambiguous contacts get classified first if we hit the cap.
  const { data: contacts, error: readErr } = await supabase
    .from("contacts")
    .select("id, email, display_name, message_count")
    .eq("clerk_user_id", userId)
    .eq("kind", "unknown")
    .eq("kind_locked", false)
    .order("message_count", { ascending: false })
    .limit(MAX_PER_CALL);

  if (readErr) {
    console.error("classify read failed", { userId, code: readErr.code });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ ok: true, classified: 0 });
  }

  // Pull a few sample subjects per contact so Claude has signal.
  const contactIds = contacts.map((c) => c.id);
  const { data: links } = await supabase
    .from("thread_participants")
    .select("contact_id, thread_id")
    .in("contact_id", contactIds);

  const threadIdsByContact = new Map<string, string[]>();
  for (const l of links ?? []) {
    const arr = threadIdsByContact.get(l.contact_id) ?? [];
    if (arr.length < 5) arr.push(l.thread_id);
    threadIdsByContact.set(l.contact_id, arr);
  }
  const allThreadIds = Array.from(
    new Set(Array.from(threadIdsByContact.values()).flat()),
  );

  const subjectByThreadId = new Map<string, string>();
  if (allThreadIds.length > 0) {
    const { data: threads } = await supabase
      .from("threads")
      .select("id, subject")
      .eq("clerk_user_id", userId)
      .in("id", allThreadIds);
    for (const t of threads ?? []) {
      if (t.subject) subjectByThreadId.set(t.id, t.subject);
    }
  }

  const targets: ClassifyTarget[] = contacts.map((c) => ({
    id: c.id,
    email: c.email,
    display_name: c.display_name,
    message_count: c.message_count,
    sample_subjects: (threadIdsByContact.get(c.id) ?? [])
      .map((tid) => subjectByThreadId.get(tid))
      .filter((s): s is string => !!s),
  }));

  let classifiedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const slice = targets.slice(i, i + BATCH_SIZE);
    try {
      const results = await classifyBatch(slice);
      // Only update rows that are still unknown + unlocked, to avoid racing
      // with a concurrent user override or sync.
      for (const r of results) {
        const { error: updErr } = await supabase
          .from("contacts")
          .update({ kind: r.kind, kind_reason: r.reason })
          .eq("clerk_user_id", userId)
          .eq("id", r.id)
          .eq("kind", "unknown")
          .eq("kind_locked", false);
        if (!updErr) classifiedCount += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("classifyBatch failed", { userId, batchStart: i, msg });
      errors.push(msg);
    }
  }

  return NextResponse.json({
    ok: true,
    classified: classifiedCount,
    requested: targets.length,
    errors,
  });
}
