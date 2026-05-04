"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";

// v3: this control no longer triggers auto-discovery. The "Sync" button is
// repurposed as "Enrich" — it kicks off a client-driven bulk enrichment
// loop (fetches contacts in 30-id chunks and calls /api/enrich/batch).
//
// For per-contact enrichment, see EnrichButton.tsx on the contact dashboard.

const CHUNK_SIZE = 30;
const MAX_CHUNKS = 100; // safety cap = up to 3000 contacts/run

type SyncStatus = "fresh" | "stale" | "very_stale" | "never";

function syncStatus(lastSyncAt: string | null): SyncStatus {
  if (!lastSyncAt) return "never";
  const ageMs = Date.now() - new Date(lastSyncAt).getTime();
  const ageMin = ageMs / 60_000;
  if (ageMin < 30) return "fresh";
  if (ageMin < 24 * 60) return "stale";
  return "very_stale";
}

const STATUS_TONE: Record<SyncStatus, string> = {
  fresh: "bg-success/10 text-success border-success/20",
  stale: "bg-muted text-muted-foreground border-border",
  very_stale: "bg-warning/10 text-warning border-warning/30",
  never: "bg-muted text-muted-foreground border-border",
};

export function SyncControl({
  lastSyncAt,
  connected,
}: {
  lastSyncAt: string | null;
  connected: boolean;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  const status = syncStatus(lastSyncAt);

  async function onEnrich() {
    setIsLoading(true);
    const t = toast.loading("Finding contacts to enrich…");
    try {
      // 1) pull contact IDs that are eligible for enrichment.
      const idsRes = await fetch("/api/contacts/enrichable");
      if (!idsRes.ok) throw new Error("Could not list contacts to enrich");
      const j = (await idsRes.json()) as { contactIds: string[] };
      const ids = j.contactIds ?? [];
      if (ids.length === 0) {
        toast.success("No new contacts to enrich.", {
          id: t,
          icon: <CheckCircle2 className="h-4 w-4" />,
        });
        startTransition(() => router.refresh());
        return;
      }

      let processed = 0;
      let totalThreads = 0;
      let chunks = 0;
      for (let i = 0; i < ids.length && chunks < MAX_CHUNKS; i += CHUNK_SIZE) {
        const slice = ids.slice(i, i + CHUNK_SIZE);
        toast.loading(`Enriching ${i + 1}–${i + slice.length} of ${ids.length}…`, {
          id: t,
        });
        const res = await fetch("/api/enrich/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactIds: slice }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (body.error === "reconnect_required") {
            throw new Error("Reconnect Gmail with read access first.");
          }
          throw new Error(`Enrich failed (${res.status})`);
        }
        const data = (await res.json()) as {
          processed?: number;
          threadsFound?: number;
          scoredCandidates?: string[];
        };
        processed += data.processed ?? 0;
        totalThreads += data.threadsFound ?? 0;
        chunks += 1;
      }

      toast.success(
        `Enriched ${processed} contacts · ${totalThreads} threads found`,
        { id: t, icon: <Sparkles className="h-4 w-4" /> },
      );
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrich failed", {
        id: t,
        icon: <AlertCircle className="h-4 w-4" />,
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (!connected) return null;

  return (
    <div className="flex items-center gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "hidden sm:inline-flex gap-1.5 font-normal",
              STATUS_TONE[status],
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                status === "fresh" && "bg-success",
                status === "stale" && "bg-muted-foreground",
                status === "very_stale" && "bg-warning",
                status === "never" && "bg-muted-foreground",
              )}
            />
            {status === "never"
              ? "Never enriched"
              : `Enriched ${formatRelativeTime(lastSyncAt)}`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {status === "fresh"
            ? "Your contacts' email history is up to date."
            : status === "stale"
              ? "Run Enrich to refresh thread history."
              : status === "very_stale"
                ? "Thread history is over a day old. Run Enrich."
                : "Click Enrich to find email threads with each contact."}
        </TooltipContent>
      </Tooltip>
      <Button
        size="sm"
        variant={status === "never" ? "default" : "secondary"}
        onClick={onEnrich}
        disabled={isLoading}
      >
        <RefreshCw className={cn(isLoading && "animate-spin")} />
        {isLoading ? "Enriching…" : "Enrich"}
      </Button>
    </div>
  );
}
