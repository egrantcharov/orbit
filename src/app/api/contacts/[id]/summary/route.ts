import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { summarizeRelationship } from "@/lib/anthropic/summary";

export const maxDuration = 30;

type Role = "from" | "to" | "cc";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const supabase = createSupabaseServiceClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select(
      "id, email, display_name, message_count, last_interaction_at, kind",
    )
    .eq("clerk_user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (contact.kind !== "person") {
    return NextResponse.json({ error: "not_a_person" }, { status: 400 });
  }

  const { data: links } = await supabase
    .from("thread_participants")
    .select("thread_id, role")
    .eq("contact_id", contact.id);
  const linkMap = new Map<string, Role>(
    (links ?? []).map((l) => [l.thread_id, l.role as Role]),
  );
  const threadIds = Array.from(linkMap.keys());

  const { data: threads } =
    threadIds.length > 0
      ? await supabase
          .from("threads")
          .select("id, subject, snippet, last_message_at")
          .eq("clerk_user_id", userId)
          .in("id", threadIds)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(20)
      : { data: [] as Array<{ id: string; subject: string | null; snippet: string | null; last_message_at: string | null }> };

  if (!threads || threads.length === 0) {
    return NextResponse.json({ error: "no_threads" }, { status: 400 });
  }

  try {
    const summary = await summarizeRelationship({
      displayName: contact.display_name,
      email: contact.email,
      messageCount: contact.message_count,
      lastInteractionAt: contact.last_interaction_at,
      threads: threads.map((t) => ({
        subject: t.subject,
        snippet: t.snippet,
        last_message_at: t.last_message_at,
        role: linkMap.get(t.id) ?? null,
      })),
    });

    const { error: updErr } = await supabase
      .from("contacts")
      .update({ ai_summary: summary, ai_summary_at: new Date().toISOString() })
      .eq("clerk_user_id", userId)
      .eq("id", contact.id);
    if (updErr) {
      console.error("summary save failed", { userId, code: updErr.code });
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error("summary failed", {
      userId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "summary_failed" }, { status: 500 });
  }
}
