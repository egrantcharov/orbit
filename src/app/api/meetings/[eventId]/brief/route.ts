import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getAuthClient } from "@/lib/google/auth";
import {
  hasAllScopes,
  REQUIRED_CALENDAR_SCOPES,
} from "@/lib/google/scopes";
import { generateMeetingBrief } from "@/lib/anthropic/meetingBrief";
import type { MeetingBriefingBody } from "@/lib/types/database";

export const maxDuration = 30;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ eventId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { eventId } = await ctx.params;
  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const supabase = createSupabaseServiceClient();

  if (!refresh) {
    const { data: cached } = await supabase
      .from("briefings")
      .select("body, generated_at")
      .eq("clerk_user_id", userId)
      .eq("kind", "meeting")
      .eq("ref_id", eventId)
      .maybeSingle();
    if (cached?.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({
          ok: true,
          cached: true,
          ...(cached.body as MeetingBriefingBody),
        });
      }
    }
  }

  let oauth2;
  let scopes: string[];
  try {
    const a = await getAuthClient(userId);
    oauth2 = a.oauth2;
    scopes = a.scopes;
  } catch {
    return NextResponse.json({ error: "no_mailbox" }, { status: 400 });
  }
  if (!hasAllScopes(scopes, REQUIRED_CALENDAR_SCOPES)) {
    return NextResponse.json({ error: "reconnect_required" }, { status: 400 });
  }

  const cal = google.calendar({ version: "v3", auth: oauth2 });
  const ev = await cal.events
    .get({ calendarId: "primary", eventId })
    .then((r) => r.data)
    .catch(() => null);
  if (!ev) {
    return NextResponse.json({ error: "event_not_found" }, { status: 404 });
  }

  const startISO = ev.start?.dateTime ?? ev.start?.date ?? null;
  const endISO = ev.end?.dateTime ?? ev.end?.date ?? null;
  const durationMin =
    startISO && endISO
      ? Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60_000)
      : null;
  if (!startISO) {
    return NextResponse.json({ error: "no_start" }, { status: 400 });
  }

  const attendeeEmails = (ev.attendees ?? [])
    .filter((a) => a.email && !a.self)
    .map((a) => a.email!.toLowerCase());

  const { data: matchedContacts } = attendeeEmails.length
    ? await supabase
        .from("contacts")
        .select(
          "id, email, display_name, company, job_title, industry, ai_summary, interests, notes, met_at, met_via",
        )
        .eq("clerk_user_id", userId)
        .in("email", attendeeEmails)
    : { data: [] };

  const contactIds = (matchedContacts ?? []).map((c) => c.id);
  const { data: links } = contactIds.length
    ? await supabase
        .from("thread_participants")
        .select("contact_id, thread_id")
        .in("contact_id", contactIds)
    : { data: [] };
  const threadIdsByContact = new Map<string, string[]>();
  for (const l of links ?? []) {
    const arr = threadIdsByContact.get(l.contact_id) ?? [];
    arr.push(l.thread_id);
    threadIdsByContact.set(l.contact_id, arr);
  }
  const allThreadIds = Array.from(
    new Set(Array.from(threadIdsByContact.values()).flat()),
  );
  const { data: threads } = allThreadIds.length
    ? await supabase
        .from("threads")
        .select("id, subject, body_excerpt, snippet, last_message_at")
        .in("id", allThreadIds)
        .eq("clerk_user_id", userId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
    : { data: [] };
  const threadById = new Map((threads ?? []).map((t) => [t.id, t]));

  const { data: interactions } = contactIds.length
    ? await supabase
        .from("interactions")
        .select("contact_id, kind, occurred_at, title, body")
        .eq("clerk_user_id", userId)
        .in("contact_id", contactIds)
        .order("occurred_at", { ascending: false })
    : { data: [] };
  const interactionsByContact = new Map<
    string,
    Array<{
      kind: string;
      occurredAt: string;
      title: string | null;
      body: string | null;
    }>
  >();
  for (const it of interactions ?? []) {
    const arr = interactionsByContact.get(it.contact_id) ?? [];
    arr.push({
      kind: it.kind,
      occurredAt: it.occurred_at,
      title: it.title,
      body: it.body,
    });
    interactionsByContact.set(it.contact_id, arr);
  }

  const briefAttendees = (matchedContacts ?? []).map((c) => {
    const tids = threadIdsByContact.get(c.id) ?? [];
    const recentThreads = tids
      .map((id) => threadById.get(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .slice(0, 3)
      .map((t) => ({
        subject: t.subject,
        excerpt: t.body_excerpt ?? t.snippet,
        lastMessageAt: t.last_message_at,
      }));
    return {
      displayName: c.display_name,
      email: c.email!,
      company: c.company,
      jobTitle: c.job_title,
      industry: c.industry,
      aiSummary: c.ai_summary,
      interests: c.interests,
      notes: c.notes,
      metAt: c.met_at,
      metVia: c.met_via,
      recentThreads,
      recentInteractions: interactionsByContact.get(c.id) ?? [],
    };
  });

  try {
    const result = await generateMeetingBrief({
      eventSummary: ev.summary ?? "(no title)",
      startISO,
      durationMin,
      description: ev.description ?? null,
      attendees: briefAttendees,
    });

    const body: MeetingBriefingBody = {
      eventId,
      eventSummary: ev.summary ?? "(no title)",
      startISO,
      attendees: (ev.attendees ?? [])
        .filter((a) => a.email && !a.self)
        .map((a) => {
          const lc = a.email!.toLowerCase();
          const matched = (matchedContacts ?? []).find(
            (c) => c.email && c.email.toLowerCase() === lc,
          );
          return {
            email: a.email!,
            displayName: a.displayName ?? null,
            contactId: matched?.id ?? null,
          };
        }),
      brief: result.brief,
      talkingPoints: result.talkingPoints,
    };

    // Upsert cache.
    const { data: existing } = await supabase
      .from("briefings")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("kind", "meeting")
      .eq("ref_id", eventId)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("briefings")
        .update({ body, generated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("briefings")
        .insert({
          clerk_user_id: userId,
          kind: "meeting",
          ref_id: eventId,
          body,
        });
    }

    return NextResponse.json({ ok: true, cached: false, ...body });
  } catch (err) {
    console.error("meeting brief failed", {
      userId,
      eventId,
      msg: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "brief_failed" }, { status: 500 });
  }
}
