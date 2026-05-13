/**
 * GET /api/contacts/[id]/history
 *
 * Unified, paginated conversation history for a contact. Merges three
 * sources into one chronological stream:
 *
 *   - `threads`           (Gmail email threads where this contact participated)
 *   - `interactions`      (manual logs, voice memos, phone, iMessage, etc.)
 *   - calendar events come in via the interactions table too (kind=calendar_event)
 *
 * Cursor pagination by `before` (ISO timestamp). Default page size 25.
 * Optional `q` does case-insensitive substring search against subject/title/body.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { InteractionKind } from "@/lib/types/database";

const PAGE_SIZE = 25;
const MAX_Q = 200;

export type HistoryItem =
  | {
      kind: "email_thread";
      id: string;
      occurredAt: string;
      subject: string | null;
      preview: string | null;
      role: "from" | "to" | "cc" | null;
    }
  | {
      kind: InteractionKind;
      id: string;
      occurredAt: string;
      title: string | null;
      body: string | null;
      audio: { path: string; durationMs: number | null; mime: string | null } | null;
    };

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: contactId } = await ctx.params;

  const url = new URL(req.url);
  const beforeRaw = url.searchParams.get("before");
  const before =
    beforeRaw && !Number.isNaN(Date.parse(beforeRaw))
      ? new Date(beforeRaw).toISOString()
      : null;
  const qRaw = url.searchParams.get("q");
  const q = qRaw ? qRaw.trim().slice(0, MAX_Q) : "";

  const supabase = createSupabaseServiceClient();

  // Ownership guard.
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const items: HistoryItem[] = [];

  // 1) Thread participants → threads (email side).
  const { data: links } = await supabase
    .from("thread_participants")
    .select("thread_id, role")
    .eq("contact_id", contactId);
  const linkMap = new Map<string, "from" | "to" | "cc">(
    (links ?? []).map((l) => [l.thread_id, l.role as "from" | "to" | "cc"]),
  );

  if (linkMap.size > 0) {
    let tq = supabase
      .from("threads")
      .select("id, subject, snippet, body_excerpt, last_message_at")
      .eq("clerk_user_id", userId)
      .in("id", Array.from(linkMap.keys()))
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(PAGE_SIZE * 2); // overfetch a bit; we'll trim after merging.
    if (before) tq = tq.lt("last_message_at", before);
    if (q) {
      // Postgres OR across subject/snippet/body_excerpt. Each token gets
      // wrapped to escape commas (which would split the .or filter).
      const safe = q.replace(/[%,()]/g, " ");
      tq = tq.or(
        `subject.ilike.%${safe}%,snippet.ilike.%${safe}%,body_excerpt.ilike.%${safe}%`,
      );
    }
    const { data: threads } = await tq;
    for (const t of threads ?? []) {
      if (!t.last_message_at) continue;
      items.push({
        kind: "email_thread",
        id: t.id,
        occurredAt: t.last_message_at,
        subject: t.subject,
        preview: t.body_excerpt ?? t.snippet,
        role: linkMap.get(t.id) ?? null,
      });
    }
  }

  // 2) interactions (notes, voice, phone, imessage, calendar_event).
  let iq = supabase
    .from("interactions")
    .select(
      "id, kind, occurred_at, title, body, audio_path, audio_duration_ms, audio_mime",
    )
    .eq("clerk_user_id", userId)
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(PAGE_SIZE * 2);
  if (before) iq = iq.lt("occurred_at", before);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    iq = iq.or(`title.ilike.%${safe}%,body.ilike.%${safe}%`);
  }
  const { data: interactions } = await iq;
  for (const r of interactions ?? []) {
    items.push({
      kind: r.kind,
      id: r.id,
      occurredAt: r.occurred_at,
      title: r.title,
      body: r.body,
      audio: r.audio_path
        ? {
            path: r.audio_path,
            durationMs: r.audio_duration_ms,
            mime: r.audio_mime,
          }
        : null,
    });
  }

  // Merge, sort, trim to a single page. `nextBefore` is the timestamp of the
  // last item we shipped — pass it back as `?before=` for the next page.
  items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const page = items.slice(0, PAGE_SIZE);
  const nextBefore =
    items.length > PAGE_SIZE ? page[page.length - 1]?.occurredAt ?? null : null;

  return NextResponse.json({
    ok: true,
    items: page,
    nextBefore,
    hasMore: items.length > PAGE_SIZE,
  });
}
