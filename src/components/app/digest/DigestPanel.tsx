"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";

export function DigestPanel({
  initialBody,
  initialCreatedAt,
  initialWeekStart,
  initialContactsIn,
  initialThreadsIn,
}: {
  initialBody: string | null;
  initialCreatedAt: string | null;
  initialWeekStart: string | null;
  initialContactsIn: number;
  initialThreadsIn: number;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [createdAt, setCreatedAt] = useState(initialCreatedAt);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [contactsIn, setContactsIn] = useState(initialContactsIn);
  const [threadsIn, setThreadsIn] = useState(initialThreadsIn);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function generate() {
    setIsLoading(true);
    const t = toast.loading("Drafting this week's digest…");
    try {
      const res = await fetch("/api/digest/weekly", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Digest failed (${res.status})`);
      }
      setBody(data.body);
      setCreatedAt(new Date().toISOString());
      setWeekStart(data.weekStart);
      setContactsIn(data.contactsIn ?? 0);
      setThreadsIn(data.threadsIn ?? 0);
      toast.success(data.cached ? "Loaded cached digest" : "Digest ready", {
        id: t,
      });
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Digest failed", { id: t });
    } finally {
      setIsLoading(false);
    }
  }

  if (!body) {
    return (
      <Card className="p-8 flex flex-col items-center text-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold tracking-tight">
            Generate this week&apos;s digest
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
            Claude will read every newsletter in your inbox from the past 7
            days and write a clustered, takeaway-first summary you can scan in
            under a minute.
          </p>
        </div>
        <Button onClick={generate} disabled={isLoading} size="lg">
          {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Generate digest
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="text-lg font-semibold tracking-tight">
              Week of {weekStart}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {threadsIn} threads from {contactsIn} newsletter contacts ·{" "}
            generated {formatRelativeTime(createdAt)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={generate} disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {isLoading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <article className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed text-sm">
        {body}
      </article>
    </Card>
  );
}
