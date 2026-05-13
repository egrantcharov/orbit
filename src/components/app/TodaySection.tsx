"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Sparkles,
  RefreshCw,
  Cake,
  Mail,
  Mic,
  CalendarClock,
  Clock,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { EmailComposeModal } from "@/components/app/EmailComposeModal";
import { cn } from "@/lib/utils";
import type { TodayBriefingCard } from "@/lib/types/database";

type State = {
  cards: TodayBriefingCard[];
  generatedAt: string | null;
  cached: boolean;
};

export function TodaySection({ fromEmail }: { fromEmail: string | null }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/today${refresh ? "?refresh=1" : ""}`);
      if (!res.ok) throw new Error(`Today load failed (${res.status})`);
      const j = (await res.json()) as State & { ok: true };
      setState({ cards: j.cards, generatedAt: j.generatedAt, cached: j.cached });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Today load failed");
      setState({ cards: [], generatedAt: null, cached: false });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false);
  }, [load]);

  if (state === null) {
    return (
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100/60 dark:bg-amber-950/40">
            <Sparkles className="h-4 w-4 text-amber-600/60 dark:text-amber-400/60" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="h-3.5 w-32 rounded bg-foreground/15 animate-pulse" />
            <div className="h-2.5 w-44 rounded bg-foreground/10 animate-pulse" />
          </div>
        </div>
        <ul className="grid gap-2 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <li
              key={i}
              className="rounded-lg border bg-card/60 p-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-foreground/10 animate-pulse" />
                <div className="h-3 w-28 rounded bg-foreground/15 animate-pulse" />
              </div>
              <div className="h-2.5 rounded bg-foreground/10 animate-pulse" />
              <div className="h-2.5 w-[80%] rounded bg-foreground/10 animate-pulse" />
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex flex-col gap-0">
            <h2 className="text-base font-semibold tracking-tight">
              Today&apos;s nudges
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {state.cards.length === 0
                ? "Nothing pressing right now."
                : `${state.cards.length} action${state.cards.length === 1 ? "" : "s"} to consider`}
              {state.generatedAt && (
                <span> · refreshed {timeAgo(state.generatedAt)}</span>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={busy}
        >
          <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {state.cards.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No drifting connections, birthdays, unanswered emails, or upcoming
          meetings in your network. Add more contacts or run Enrich to surface
          more.
        </p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {state.cards.map((card) => (
            <TodayCardRow key={card.id} card={card} fromEmail={fromEmail} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TodayCardRow({
  card,
  fromEmail,
}: {
  card: TodayBriefingCard;
  fromEmail: string | null;
}) {
  const Icon =
    card.kind === "upcoming_meeting"
      ? CalendarClock
      : card.kind === "birthday"
        ? Cake
        : card.kind === "unanswered"
          ? Mail
          : card.kind === "voice_followup"
            ? Mic
            : Clock;

  const tone =
    card.kind === "upcoming_meeting"
      ? "text-violet-700 bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300"
      : card.kind === "birthday"
        ? "text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
        : card.kind === "unanswered"
          ? "text-rose-700 bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300"
          : card.kind === "voice_followup"
            ? "text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
            : "text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300";

  return (
    <li className="rounded-xl border bg-background p-3 flex items-start gap-3">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-medium leading-tight">{card.headline}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {card.reason}
        </p>
        {card.bullets && card.bullets.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {card.bullets.map((b, i) => (
              <li
                key={i}
                className="text-xs text-foreground/80 flex items-start gap-1.5"
              >
                <span className="text-muted-foreground">→</span>
                {b}
              </li>
            ))}
          </ul>
        )}
        {card.contactName && card.contactId && (
          <Link
            href={`/app/contact/${card.contactId}`}
            className="inline-flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground mt-1"
          >
            <ContactAvatar
              email={card.contactEmail ?? ""}
              displayName={card.contactName}
              size="sm"
            />
            <span className="truncate">{card.contactName}</span>
          </Link>
        )}
      </div>
      <CardAction card={card} fromEmail={fromEmail} />
    </li>
  );
}

function CardAction({
  card,
  fromEmail,
}: {
  card: TodayBriefingCard;
  fromEmail: string | null;
}) {
  if (card.action.type === "email" && card.contactId && card.contactEmail) {
    return (
      <EmailComposeModal
        contactId={card.contactId}
        contactEmail={card.contactEmail}
        contactName={card.contactName ?? null}
        fromEmail={fromEmail}
        defaultSubject={card.action.suggestedSubject ?? ""}
        trigger={
          <Button size="sm" variant="outline">
            <Mail className="h-3 w-3" />
            {card.action.label}
          </Button>
        }
      />
    );
  }
  if (card.action.type === "open_brief" && card.action.href) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={card.action.href}>
          <ArrowRight className="h-3 w-3" />
          Brief
        </Link>
      </Button>
    );
  }
  if (card.contactId) {
    return (
      <Button asChild size="sm" variant="ghost">
        <Link href={`/app/contact/${card.contactId}`}>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </Button>
    );
  }
  return null;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

// Suppress unused-prop warning for Badge import (reserved for future use)
void Badge;
