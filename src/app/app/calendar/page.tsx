"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Calendar as CalIcon,
  RefreshCw,
  Video,
  MapPin,
  Users,
  ExternalLink,
  Loader2,
  CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Attendee = {
  email: string | null;
  displayName: string | null;
  responseStatus: string | null;
  organizer: boolean;
  self: boolean;
};

type Event = {
  id: string | null;
  summary: string;
  description: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  allDay: boolean;
  htmlLink: string | null;
  attendees: Attendee[];
  organizer: string | null;
  hangoutLink: string | null;
};

const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function dayKey(iso: string | null): string {
  if (!iso) return "tba";
  return iso.slice(0, 10);
}

function dayLabel(key: string): string {
  if (key === "tba") return "TBA";
  const d = new Date(key + "T12:00:00");
  return DAY_FMT.format(d);
}

function timeLabel(iso: string | null, allDay: boolean): string {
  if (allDay) return "all day";
  if (!iso) return "";
  return TIME_FMT.format(new Date(iso));
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/calendar/events?days=${days}`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === "reconnect_required") {
          toast.error("Reconnect Google with calendar access first.");
          setEvents([]);
          return;
        }
        if (j.error === "no_mailbox") {
          toast.error("Connect Gmail/Calendar first.");
          setEvents([]);
          return;
        }
        throw new Error(`Calendar load failed (${res.status})`);
      }
      const j = (await res.json()) as { events: Event[] };
      setEvents(j.events);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Calendar load failed");
      setEvents([]);
    } finally {
      setBusy(false);
    }
  }, [days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Group events by day.
  const grouped = (events ?? []).reduce<Record<string, Event[]>>((acc, e) => {
    const k = dayKey(e.start);
    if (!acc[k]) acc[k] = [];
    acc[k].push(e);
    return acc;
  }, {});
  const dayKeys = Object.keys(grouped).sort();

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-4xl w-full mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Upcoming events from your primary Google Calendar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
          >
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
            <option value={60}>Next 60 days</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
            Refresh
          </Button>
          <Button asChild size="sm">
            <a
              href="https://calendar.google.com/calendar/u/0/r/eventedit"
              target="_blank"
              rel="noreferrer"
            >
              <CalendarPlus className="h-4 w-4" />
              New event
            </a>
          </Button>
        </div>
      </div>

      {events === null ? (
        <Card className="p-12 grid place-items-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </Card>
      ) : events.length === 0 ? (
        <Card className="p-12 text-center flex flex-col items-center gap-3">
          <CalIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No events in the next {days} days.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {dayKeys.map((k) => (
            <div key={k} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {dayLabel(k)}
              </h2>
              <ul className="flex flex-col gap-2">
                {grouped[k].map((e, i) => (
                  <EventRow key={e.id ?? `${k}-${i}`} ev={e} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function EventRow({ ev }: { ev: Event }) {
  const time = ev.allDay
    ? "all day"
    : `${timeLabel(ev.start, false)} – ${timeLabel(ev.end, false)}`;
  const dur = durationLabel(ev.start, ev.end);
  const others = ev.attendees.filter((a) => !a.self);
  return (
    <li className="rounded-xl border bg-card p-4 flex items-start gap-4">
      <div className="flex flex-col items-center gap-0 w-16 shrink-0 text-center">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {ev.allDay ? "All day" : timeLabel(ev.start, false)}
        </span>
        {!ev.allDay && (
          <span className="text-[11px] text-muted-foreground">{dur}</span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-medium truncate">{ev.summary}</h3>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            {time}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
          {ev.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {ev.location}
            </span>
          )}
          {ev.hangoutLink && (
            <a
              className="inline-flex items-center gap-1 text-primary hover:underline"
              href={ev.hangoutLink}
              target="_blank"
              rel="noreferrer"
            >
              <Video className="h-3 w-3" />
              Meet
            </a>
          )}
          {others.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {others
                .slice(0, 3)
                .map((a) => a.displayName ?? a.email ?? "?")
                .join(", ")}
              {others.length > 3 && ` +${others.length - 3}`}
            </span>
          )}
          {ev.htmlLink && (
            <a
              className="inline-flex items-center gap-1 text-primary hover:underline ml-auto"
              href={ev.htmlLink}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          )}
        </div>
        {ev.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
            {ev.description}
          </p>
        )}
      </div>
      {others.length > 0 && (
        <Badge
          variant="muted"
          className={cn(
            "font-normal capitalize hidden sm:inline-flex",
            (ev.attendees.find((a) => a.self)?.responseStatus ?? "needsAction") ===
              "accepted" && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {ev.attendees.find((a) => a.self)?.responseStatus ?? "n/a"}
        </Badge>
      )}
    </li>
  );
}
