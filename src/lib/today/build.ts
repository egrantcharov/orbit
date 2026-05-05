import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/google/auth";
import { hasAllScopes, REQUIRED_CALENDAR_SCOPES } from "@/lib/google/scopes";
import type { TodayBriefingCard } from "@/lib/types/database";

// Algorithmic Today builder. No LLM in the hot path — fast, deterministic,
// cheap. Per-card copy is templated; AI-generated drafts only happen when
// the user actually clicks "Draft email" on a card.

const DRIFTING_DAYS = 30;
const PINNED_QUIET_DAYS = 14;
const UPCOMING_HOURS = 48;
const BIRTHDAY_WINDOW_DAYS = 7;
const UNANSWERED_DAYS = 14;
const MAX_CARDS = 8;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function birthdayWithin(birthday: string, days: number) {
  const m = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  const year = parseInt(m[1], 10);
  const today = new Date();
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  let next = new Date(Date.UTC(today.getUTCFullYear(), month - 1, day));
  if (next.getTime() < utcToday.getTime()) {
    next = new Date(Date.UTC(today.getUTCFullYear() + 1, month - 1, day));
  }
  const daysAway = Math.round((next.getTime() - utcToday.getTime()) / 86_400_000);
  if (daysAway > days) return null;
  const monthName = next.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const age = year > 1900 ? next.getUTCFullYear() - year : null;
  return { daysAway, age, label: `${monthName} ${day}` };
}

export async function buildTodayCards(
  clerkUserId: string,
): Promise<TodayBriefingCard[]> {
  const supabase = createSupabaseServiceClient();
  const cards: TodayBriefingCard[] = [];

  // 1) UPCOMING MEETINGS — calendar events in next 48h with attendees who
  // are in our contacts. Skip if Calendar scope missing.
  try {
    const auth = await getAuthClient(clerkUserId).catch(() => null);
    if (auth && hasAllScopes(auth.scopes, REQUIRED_CALENDAR_SCOPES)) {
      const cal = google.calendar({ version: "v3", auth: auth.oauth2 });
      const r = await cal.events.list({
        calendarId: "primary",
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + UPCOMING_HOURS * 3_600_000).toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 25,
      });
      const events = r.data.items ?? [];
      const attendeeEmails = new Set<string>();
      for (const e of events) {
        for (const a of e.attendees ?? []) {
          if (a.email && !a.self) attendeeEmails.add(a.email.toLowerCase());
        }
      }
      const { data: matchedContacts } = attendeeEmails.size
        ? await supabase
            .from("contacts")
            .select("id, email, display_name")
            .eq("clerk_user_id", clerkUserId)
            .in("email", Array.from(attendeeEmails))
        : { data: [] };
      const contactByEmail = new Map(
        (matchedContacts ?? []).map((c) => [
          c.email!.toLowerCase(),
          { id: c.id, name: c.display_name ?? c.email! },
        ]),
      );
      for (const e of events) {
        if (!e.id) continue;
        const startISO = e.start?.dateTime ?? e.start?.date ?? null;
        if (!startISO) continue;
        const knownAttendees = (e.attendees ?? [])
          .map((a) => a.email?.toLowerCase())
          .filter((email): email is string => !!email)
          .map((email) => contactByEmail.get(email))
          .filter((x): x is { id: string; name: string } => !!x);
        if (knownAttendees.length === 0) continue;
        const start = new Date(startISO);
        const inHours = Math.max(0, Math.round((start.getTime() - Date.now()) / 3_600_000));
        const whenLabel =
          inHours < 1
            ? "starting now"
            : inHours < 24
              ? `in ${inHours}h`
              : `tomorrow ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
        cards.push({
          id: `meeting:${e.id}`,
          kind: "upcoming_meeting",
          contactId: knownAttendees[0]?.id ?? null,
          contactName: knownAttendees[0]?.name ?? null,
          contactEmail: null,
          headline: `Brief for ${e.summary ?? "your meeting"} — ${whenLabel}`,
          reason: `${knownAttendees.map((a) => a.name).slice(0, 3).join(", ")}${
            knownAttendees.length > 3 ? ` +${knownAttendees.length - 3}` : ""
          }`,
          action: {
            type: "open_brief",
            label: "Open brief",
            href: `/app/meetings?event=${encodeURIComponent(e.id)}`,
          },
        });
      }
    }
  } catch {
    // calendar not connected — skip this category
  }

  // 2) UNANSWERED — recent (last 14d) inbound threads from contacts where
  // user hasn't participated.
  const { data: unansweredThreads } = await supabase
    .from("threads")
    .select("id, subject, last_message_at")
    .eq("clerk_user_id", clerkUserId)
    .eq("user_participated", false)
    .eq("has_unsubscribe", false)
    .gte("last_message_at", daysAgoIso(UNANSWERED_DAYS))
    .order("last_message_at", { ascending: false })
    .limit(20);
  if (unansweredThreads && unansweredThreads.length > 0) {
    const threadIds = unansweredThreads.map((t) => t.id);
    const { data: links } = await supabase
      .from("thread_participants")
      .select("thread_id, contact_id")
      .in("thread_id", threadIds)
      .eq("role", "from");
    const contactIdsSet = new Set((links ?? []).map((l) => l.contact_id));
    const { data: contacts } = contactIdsSet.size
      ? await supabase
          .from("contacts")
          .select("id, email, display_name, score_keep_in_touch")
          .eq("clerk_user_id", clerkUserId)
          .eq("is_archived", false)
          .in("id", Array.from(contactIdsSet))
      : { data: [] };
    const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));
    const threadToContact = new Map<string, string>();
    for (const l of links ?? []) {
      if (!threadToContact.has(l.thread_id)) {
        threadToContact.set(l.thread_id, l.contact_id);
      }
    }
    for (const t of unansweredThreads) {
      const contactId = threadToContact.get(t.id);
      if (!contactId) continue;
      const c = contactById.get(contactId);
      if (!c) continue;
      cards.push({
        id: `unanswered:${t.id}`,
        kind: "unanswered",
        contactId: c.id,
        contactName: c.display_name ?? c.email,
        contactEmail: c.email,
        headline: `Reply to ${c.display_name ?? c.email}`,
        reason: `They emailed you${t.subject ? ` — "${t.subject.slice(0, 60)}"` : ""}, no reply yet`,
        action: {
          type: "email",
          label: "Draft reply",
          intent: t.subject
            ? `Reply to "${t.subject.slice(0, 80)}"`
            : "Friendly reply",
        },
      });
    }
  }

  // 3) BIRTHDAYS — next 7 days.
  const { data: birthdayCandidates } = await supabase
    .from("contacts")
    .select("id, email, display_name, birthday")
    .eq("clerk_user_id", clerkUserId)
    .eq("is_archived", false)
    .not("birthday", "is", null);
  for (const c of birthdayCandidates ?? []) {
    if (!c.birthday) continue;
    const info = birthdayWithin(c.birthday, BIRTHDAY_WINDOW_DAYS);
    if (!info) continue;
    const whenLabel =
      info.daysAway === 0
        ? "today"
        : info.daysAway === 1
          ? "tomorrow"
          : `in ${info.daysAway} days`;
    cards.push({
      id: `birthday:${c.id}`,
      kind: "birthday",
      contactId: c.id,
      contactName: c.display_name ?? c.email,
      contactEmail: c.email,
      headline: `${c.display_name ?? c.email}'s birthday ${whenLabel}`,
      reason: `${info.label}${info.age != null ? ` · turns ${info.age}` : ""}`,
      action: {
        type: "email",
        label: "Wish them",
        suggestedSubject: "Happy birthday!",
        intent: "Short, warm happy-birthday note",
      },
    });
  }

  // 4) DRIFTING — high-value contacts you haven't talked to in 30+ days.
  const { data: drifting } = await supabase
    .from("contacts")
    .select(
      "id, email, display_name, last_interaction_at, score_keep_in_touch, score_career_relevance",
    )
    .eq("clerk_user_id", clerkUserId)
    .eq("is_archived", false)
    .gte("score_keep_in_touch", 0.5)
    .lt("last_interaction_at", daysAgoIso(DRIFTING_DAYS))
    .order("score_keep_in_touch", { ascending: false, nullsFirst: false })
    .limit(5);
  for (const c of drifting ?? []) {
    if (!c.email) continue;
    const lastIso = c.last_interaction_at;
    const lastDays = lastIso
      ? Math.round((Date.now() - new Date(lastIso).getTime()) / 86_400_000)
      : null;
    cards.push({
      id: `drifting:${c.id}`,
      kind: "drifting",
      contactId: c.id,
      contactName: c.display_name ?? c.email,
      contactEmail: c.email,
      headline: `Reach back out to ${c.display_name ?? c.email}`,
      reason: lastDays
        ? `${lastDays} days since last contact · keep-in-touch score ${Math.round((c.score_keep_in_touch ?? 0) * 100)}`
        : `Worth maintaining · keep-in-touch ${Math.round((c.score_keep_in_touch ?? 0) * 100)}`,
      action: {
        type: "email",
        label: "Draft a check-in",
        intent: "Friendly check-in after a long quiet stretch",
      },
    });
  }

  // 5) PINNED & QUIET — pinned but stale.
  const { data: stalePinned } = await supabase
    .from("contacts")
    .select("id, email, display_name, last_interaction_at")
    .eq("clerk_user_id", clerkUserId)
    .eq("is_pinned", true)
    .eq("is_archived", false)
    .lt("last_interaction_at", daysAgoIso(PINNED_QUIET_DAYS))
    .order("last_interaction_at", { ascending: true, nullsFirst: true })
    .limit(3);
  for (const c of stalePinned ?? []) {
    if (!c.email) continue;
    const lastIso = c.last_interaction_at;
    const lastDays = lastIso
      ? Math.round((Date.now() - new Date(lastIso).getTime()) / 86_400_000)
      : null;
    cards.push({
      id: `stale_pinned:${c.id}`,
      kind: "drifting",
      contactId: c.id,
      contactName: c.display_name ?? c.email,
      contactEmail: c.email,
      headline: `Pinned, going quiet — ${c.display_name ?? c.email}`,
      reason: lastDays ? `Last talked ${lastDays} days ago` : "Last contact unknown",
      action: {
        type: "email",
        label: "Draft a quick note",
        intent: "Brief check-in to a pinned contact",
      },
    });
  }

  // Rank: meetings first (urgency), then unanswered, birthdays, drifting,
  // stale_pinned. Cap at MAX_CARDS, but always keep at least one of each
  // category if possible.
  const order: Record<TodayBriefingCard["kind"], number> = {
    upcoming_meeting: 0,
    unanswered: 1,
    birthday: 2,
    drifting: 3,
    scheduled_followup: 4,
    general: 5,
  };
  cards.sort((a, b) => order[a.kind] - order[b.kind]);
  return cards.slice(0, MAX_CARDS);
}
