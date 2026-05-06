"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sparkles,
  RefreshCw,
  Newspaper,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  SynthDailyBody,
  SynthWeeklyBody,
  SynthCard,
} from "@/lib/types/database";

type DailyState = SynthDailyBody | null;
type WeeklyState = SynthWeeklyBody | null;

export default function SynthPage() {
  const [daily, setDaily] = useState<DailyState>(null);
  const [weekly, setWeekly] = useState<WeeklyState>(null);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [weeklyBusy, setWeeklyBusy] = useState(false);

  const loadDaily = useCallback(async (refresh = false) => {
    setDailyBusy(true);
    try {
      const res = await fetch(
        `/api/synth/daily${refresh ? "?refresh=1" : ""}`,
      );
      if (!res.ok) throw new Error(`Daily failed (${res.status})`);
      const j = (await res.json()) as SynthDailyBody;
      setDaily(j);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Daily failed");
      setDaily({ generatedAt: "", cards: [], itemsConsidered: 0 });
    } finally {
      setDailyBusy(false);
    }
  }, []);

  const loadWeekly = useCallback(async (refresh = false) => {
    setWeeklyBusy(true);
    try {
      const res = await fetch(
        `/api/synth/weekly${refresh ? "?refresh=1" : ""}`,
      );
      if (!res.ok) throw new Error(`Weekly failed (${res.status})`);
      const j = (await res.json()) as SynthWeeklyBody;
      setWeekly(j);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Weekly failed");
      setWeekly({ generatedAt: "", clusters: [], itemsConsidered: 0 });
    } finally {
      setWeeklyBusy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDaily(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWeekly(false);
  }, [loadDaily, loadWeekly]);

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-5xl w-full mx-auto flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-amber-500" />
          Synth
        </h1>
        <p className="text-sm text-muted-foreground">
          AI-condensed reading from your subscriptions and newsletters. Daily
          punch on the left, weekly themes on the right.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DailyPanel
          state={daily}
          busy={dailyBusy}
          onRefresh={() => void loadDaily(true)}
        />
        <WeeklyPanel
          state={weekly}
          busy={weeklyBusy}
          onRefresh={() => void loadWeekly(true)}
        />
      </div>
    </main>
  );
}

function DailyPanel({
  state,
  busy,
  onRefresh,
}: {
  state: DailyState;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card className="p-5 flex flex-col gap-3 h-fit">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0">
          <h2 className="text-base font-semibold">Today&apos;s punch</h2>
          <p className="text-[11px] text-muted-foreground">
            {state
              ? state.cards.length === 0
                ? state.itemsConsidered === 0
                  ? "Nothing in your queue from the past day."
                  : "Not enough signal for a punch — check tomorrow."
                : `${state.cards.length} item${state.cards.length === 1 ? "" : "s"} from ${state.itemsConsidered} sources`
              : "Loading…"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
          <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
          Refresh
        </Button>
      </div>
      {state === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : state.cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <Newspaper className="h-5 w-5 opacity-60" />
          {state.itemsConsidered === 0
            ? "Subscribe to a publication on /app/reads or sync your inbox."
            : "Mostly fluff today — try again tomorrow."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {state.cards.map((c, i) => (
            <CardItem key={i} card={c} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function WeeklyPanel({
  state,
  busy,
  onRefresh,
}: {
  state: WeeklyState;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card className="p-5 flex flex-col gap-3 h-fit">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0">
          <h2 className="text-base font-semibold">This week</h2>
          <p className="text-[11px] text-muted-foreground">
            {state
              ? state.clusters.length === 0
                ? "Need more reading volume to find clusters."
                : `${state.clusters.length} theme${state.clusters.length === 1 ? "" : "s"} from ${state.itemsConsidered} sources`
              : "Loading…"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
          <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
          Refresh
        </Button>
      </div>
      {state === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : state.clusters.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <Newspaper className="h-5 w-5 opacity-60" />
          Add a few subscriptions on /app/reads — we need at least 3
          articles or newsletter threads to find themes.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {state.clusters.map((cl, i) => (
            <div key={i} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {cl.title}
              </h3>
              <ul className="flex flex-col gap-2">
                {cl.takeaways.map((c, j) => (
                  <CardItem key={j} card={c} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CardItem({ card }: { card: SynthCard }) {
  return (
    <li className="rounded-lg border bg-background p-3 flex flex-col gap-1.5">
      <p className="text-sm leading-relaxed">{card.takeaway}</p>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="muted" className="font-normal">
          {card.citation}
        </Badge>
        {card.source_url && (
          <a
            href={card.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            open
          </a>
        )}
      </div>
    </li>
  );
}
