"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SyncButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSync() {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Sync failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onSync}
        disabled={isLoading}
        className="inline-flex h-9 items-center rounded-full bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
      >
        {isLoading ? "Syncing…" : "Sync now"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
