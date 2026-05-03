"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { ContactKind } from "@/lib/types/database";

const ACTIONS: Array<{ label: string; kinds: ContactKind[] }> = [
  { label: "Hide all marketing & retail", kinds: ["bulk_marketing", "transactional"] },
  { label: "Hide all automated alerts", kinds: ["automated", "noreply"] },
  { label: "Hide all newsletters", kinds: ["newsletter"] },
  { label: "Hide all unknown", kinds: ["unknown"] },
];

export function CleanupMenu() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function run(kinds: ContactKind[], label: string) {
    if (busy) return;
    setBusy(true);
    const t = toast.loading(label + "…");
    try {
      const res = await fetch("/api/contacts/bulk-hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kinds }),
      });
      if (!res.ok) throw new Error(`Bulk hide failed (${res.status})`);
      const json = (await res.json()) as { hidden?: number };
      toast.success(`Hidden ${json.hidden ?? 0} contacts`, { id: t });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk hide failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full">
          <Sparkles className="h-4 w-4" />
          Clean up
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Bulk hide</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIONS.map((a) => (
          <DropdownMenuItem
            key={a.label}
            disabled={busy}
            onClick={() => run(a.kinds, a.label)}
          >
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
