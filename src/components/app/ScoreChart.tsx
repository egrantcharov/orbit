"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScoresRationale } from "@/lib/types/database";

type Dim = {
  key: keyof ScoresRationale;
  label: string;
  hint: string;
};

const DIMS: Dim[] = [
  { key: "closeness", label: "Closeness", hint: "How close you are right now" },
  { key: "keep_in_touch", label: "Keep in touch", hint: "Effort worth investing to maintain" },
  { key: "industry_overlap", label: "Industry overlap", hint: "Professional adjacency" },
  { key: "age_proximity", label: "Age proximity", hint: "Estimated decade alignment" },
  { key: "career_relevance", label: "Career relevance", hint: "Useful for your trajectory" },
];

export type ScoreState = {
  closeness: number | null;
  keep_in_touch: number | null;
  industry_overlap: number | null;
  age_proximity: number | null;
  career_relevance: number | null;
  rationale: ScoresRationale | null;
  scoresAt: string | null;
};

export function ScoreChart({
  contactId,
  initial,
}: {
  contactId: string;
  initial: ScoreState;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function generate() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading(state.scoresAt ? "Refreshing scores…" : "Scoring relationship…");
    try {
      const res = await fetch(`/api/contacts/${contactId}/scores`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Score failed (${res.status})`);
      const j = (await res.json()) as {
        scores: {
          closeness: number;
          keep_in_touch: number;
          industry_overlap: number;
          age_proximity: number;
          career_relevance: number;
          rationale: ScoresRationale;
        };
      };
      setState({
        closeness: j.scores.closeness,
        keep_in_touch: j.scores.keep_in_touch,
        industry_overlap: j.scores.industry_overlap,
        age_proximity: j.scores.age_proximity,
        career_relevance: j.scores.career_relevance,
        rationale: j.scores.rationale,
        scoresAt: new Date().toISOString(),
      });
      toast.success("Scores updated", { id: t });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Score failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  const hasScores = state.closeness !== null;

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold tracking-tight inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Relationship dimensions
          </h3>
          <p className="text-xs text-muted-foreground">
            {hasScores
              ? `Generated ${state.scoresAt ? new Date(state.scoresAt).toLocaleDateString() : ""}. Hover any bar for the rationale.`
              : "AI-scored across five dimensions to ground keep-in-touch nudges."}
          </p>
        </div>
        <Button
          onClick={generate}
          disabled={busy}
          variant={hasScores ? "outline" : "default"}
          size="sm"
        >
          {busy ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {hasScores ? "Refresh" : "Generate"}
        </Button>
      </div>

      {hasScores && (
        <div className="flex flex-col gap-3">
          {DIMS.map((d) => {
            const val = state[d.key as keyof ScoreState] as number | null;
            const rationale = state.rationale?.[d.key];
            const pct = val == null ? 0 : Math.round(val * 100);
            return (
              <div
                key={d.key}
                className="flex flex-col gap-1"
                title={rationale || d.hint}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{d.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {pct}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pct >= 70
                        ? "bg-emerald-500"
                        : pct >= 40
                          ? "bg-amber-500"
                          : "bg-rose-400",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {rationale && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {rationale}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
