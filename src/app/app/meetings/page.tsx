"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar as CalIcon,
  RefreshCw,
  Video,
  Users,
  ExternalLink,
  Loader2,
  Sparkles,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContactAvatar } from "@/components/ui/contact-avatar";
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

type Brief = {
  eventId: string;
  eventSummary: string;
  startISO: string;
  attendees: Array<{
    email: string;
    displayName: string | null;
    contactId?: string | null;
  }>;
  brief: string;
  talkingPoints: string[];
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

export default function MeetingsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const focusedEventId = sp.get("event");
  const [events, setEvents] = useState<Event[] | null>(null);
  const [days, setDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);

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

  const loadBrief = useCallback(async (eventId: string, refresh = false) => {
    setBriefBusy(true);
    try {
      const res = await fetch(
        `/api/meetings/${encodeURIComponent(eventId)}/brief${refresh ? "?refresh=1" : ""}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === "reconnect_required") {
          throw new Error("Reconnect Google with calendar access first.");
        }
        throw new Error(`Brief failed (${res.status})`);
      }
      const j = (await res.json()) as Brief;
      setBrief(j);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Brief failed");
    } finally {
      setBriefBusy(false);
    }
  }, []);

  useEffect(() => {
    if (focusedEventId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadBrief(focusedEventId, false);
    }
  }, [focusedEventId, loadBrief]);

  if (focusedEventId) {
    return (
      <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-3xl w-full mx-auto flex flex-col gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
            <Link href="/app/meetings">
              <ArrowLeft />
              All meetings
            </Link>
          </Button>
        </div>
        {brief === null ? (
          <Card className="p-12 grid place-items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </Card>
        ) : (
          <BriefView
            brief={brief}
            busy={briefBusy}
            onRegenerate={() => void loadBrief(brief.eventId, true)}
          />
        )}
      </main>
    );
  }

  // Group events by day; only meetings with at least one non-self attendee.
  const meetingEvents = (events ?? []).filter(
    (e) => e.attendees.filter((a) => !a.self).length > 0,
  );
  const grouped = meetingEvents.reduce<Record<string, Event[]>>((acc, e) => {
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
          <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Upcoming events with attendees. Click any meeting for an
            AI-generated prep brief.
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
          </select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {events === null ? (
        <Card className="p-12 grid place-items-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </Card>
      ) : meetingEvents.length === 0 ? (
        <Card className="p-12 text-center flex flex-col items-center gap-3">
          <CalIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No meetings with attendees in the next {days} days.
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
                  <MeetingRow
                    key={e.id ?? `${k}-${i}`}
                    ev={e}
                    onOpen={() =>
                      e.id &&
                      router.push(`/app/meetings?event=${encodeURIComponent(e.id)}`)
                    }
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function MeetingRow({ ev, onOpen }: { ev: Event; onOpen: () => void }) {
  const others = ev.attendees.filter((a) => !a.self);
  return (
    <li className="rounded-xl border bg-card p-4 flex items-start gap-4 hover:bg-accent/30 transition-colors">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 items-start gap-4 min-w-0 text-left"
      >
        <div className="flex flex-col items-center gap-0 w-16 shrink-0 text-center">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {ev.allDay ? "All day" : timeLabel(ev.start, false)}
          </span>
          {!ev.allDay && ev.end && (
            <span className="text-[11px] text-muted-foreground">
              {timeLabel(ev.end, false)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <h3 className="text-sm font-medium truncate">{ev.summary}</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span className="truncate">
              {others
                .slice(0, 3)
                .map((a) => a.displayName ?? a.email)
                .filter(Boolean)
                .join(", ")}
              {others.length > 3 && ` +${others.length - 3}`}
            </span>
            {ev.hangoutLink && (
              <span className="inline-flex items-center gap-1 text-primary">
                <Video className="h-3 w-3" />
                Meet
              </span>
            )}
          </div>
        </div>
      </button>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Button size="sm" variant="outline" onClick={onOpen}>
          <Sparkles className="h-3 w-3" />
          Brief
        </Button>
        {ev.htmlLink && (
          <a
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            href={ev.htmlLink}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
        )}
      </div>
    </li>
  );
}

function BriefView({
  brief,
  busy,
  onRegenerate,
}: {
  brief: Brief;
  busy: boolean;
  onRegenerate: () => void;
}) {
  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {brief.eventSummary}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(brief.startISO).toLocaleString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRegenerate} disabled={busy}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Regenerate
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {brief.attendees.map((a) => (
          <Badge
            key={a.email}
            variant="muted"
            className="font-normal inline-flex items-center gap-1.5"
          >
            <ContactAvatar email={a.email} displayName={a.displayName} size="sm" />
            <span>{a.displayName ?? a.email}</span>
            {a.contactId && (
              <Link
                href={`/app/contact/${a.contactId}`}
                className="ml-1 text-primary hover:underline text-[11px]"
              >
                open
              </Link>
            )}
          </Badge>
        ))}
      </div>

      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p className="whitespace-pre-wrap leading-relaxed text-sm">
          {brief.brief}
        </p>
      </div>

      {brief.talkingPoints.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold tracking-tight">
            Talking points
          </h3>
          <ul className="flex flex-col gap-1.5 pl-5 list-disc text-sm leading-relaxed">
            {brief.talkingPoints.map((tp, i) => (
              <li key={i}>{tp}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
