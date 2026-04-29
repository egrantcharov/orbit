"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";

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

  async function onSync() {
    setIsLoading(true);
    const t = toast.loading("Syncing your inbox…");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Sync failed (${res.status})`);
      }
      toast.success(
        `Synced ${body.messagesScanned ?? 0} messages, ${body.contactsUpserted ?? 0} contacts`,
        { id: t, icon: <CheckCircle2 className="h-4 w-4" /> },
      );
      // Fire-and-forget: classify any heuristic-stumped contacts via Claude.
      // Refresh router state once it returns; ignore errors silently — the
      // app stays usable even if classification is unavailable (no API key,
      // rate limit, etc.).
      void fetch("/api/classify", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((info) => {
          if (info?.classified > 0) {
            toast.success(`Classified ${info.classified} contacts via AI`);
          }
          startTransition(() => router.refresh());
        })
        .catch(() => startTransition(() => router.refresh()));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed", {
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
              ? "Not synced"
              : `Synced ${formatRelativeTime(lastSyncAt)}`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {status === "fresh"
            ? "Your contacts are up to date."
            : status === "stale"
              ? "Your contacts may be a few hours behind."
              : status === "very_stale"
                ? "Your contacts are over a day behind. Sync again."
                : "You haven't synced yet."}
        </TooltipContent>
      </Tooltip>
      <Button
        size="sm"
        variant={status === "never" ? "default" : "secondary"}
        onClick={onSync}
        disabled={isLoading}
      >
        <RefreshCw className={cn(isLoading && "animate-spin")} />
        {isLoading ? "Syncing…" : "Sync"}
      </Button>
    </div>
  );
}
