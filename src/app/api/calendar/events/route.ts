import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/google/auth";
import {
  hasAllScopes,
  REQUIRED_CALENDAR_SCOPES,
} from "@/lib/google/scopes";

export const maxDuration = 30;

// GET /api/calendar/events?days=14 — upcoming events from primary calendar.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const days = Math.min(60, Math.max(1, parseInt(url.searchParams.get("days") ?? "14", 10) || 14));

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
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();

  const res = await cal.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 100,
  });

  const events = (res.data.items ?? []).map((e) => ({
    id: e.id ?? null,
    summary: e.summary ?? "(no title)",
    description: e.description ?? null,
    location: e.location ?? null,
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
    allDay: !e.start?.dateTime,
    htmlLink: e.htmlLink ?? null,
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.email ?? null,
      displayName: a.displayName ?? null,
      responseStatus: a.responseStatus ?? null,
      organizer: a.organizer ?? false,
      self: a.self ?? false,
    })),
    organizer: e.organizer?.email ?? null,
    hangoutLink: e.hangoutLink ?? null,
  }));

  return NextResponse.json({ ok: true, events });
}
