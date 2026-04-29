"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";

const STALE_DAYS = 30;

function isOlderThanDays(iso: string | null, days: number): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > days * 86_400_000;
}

export function SummaryCard({
  contactId,
  isPerson,
  initialSummary,
  initialSummaryAt,
}: {
  contactId: string;
  isPerson: boolean;
  initialSummary: string | null;
  initialSummaryAt: string | null;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(initialSummary);
  const [summaryAt, setSummaryAt] = useState(initialSummaryAt);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  if (!isPerson) return null;

  const isStale = isOlderThanDays(summaryAt, STALE_DAYS);

  async function generate() {
    setIsLoading(true);
    const t = toast.loading("Drafting relationship summary…");
    try {
      const res = await fetch(`/api/contacts/${contactId}/summary`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Summary failed (${res.status})`);
      }
      setSummary(body.summary);
      setSummaryAt(new Date().toISOString());
      toast.success("Summary generated", { id: t });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Summary failed", { id: t });
    } finally {
      setIsLoading(false);
    }
  }

  if (!summary) {
    return (
      <Card className="p-5 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-foreground shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">
            Generate a relationship summary
          </h3>
          <p className="text-xs text-muted-foreground">
            Claude reads your recent threads and writes a short paragraph
            describing what you and this person talk about.
          </p>
        </div>
        <Button onClick={generate} disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Generate
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <h3 className="text-sm font-semibold tracking-tight">
            Relationship summary
          </h3>
          {isStale && (
            <span className="text-[11px] text-warning">stale</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={generate}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {isLoading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <p className="text-sm leading-relaxed">{summary}</p>
      {summaryAt && (
        <p className="text-[11px] text-muted-foreground">
          Generated {formatRelativeTime(summaryAt)}
        </p>
      )}
    </Card>
  );
}
