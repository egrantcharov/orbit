"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Per-contact enrichment trigger. After successful enrichment with ≥3
// threads found, fires off a scoring run too (single contact, single call).
export function EnrichButton({
  contactId,
  hasEmail,
  size = "default",
}: {
  contactId: string;
  hasEmail: boolean;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function run() {
    if (busy) return;
    setBusy(true);
    const t = toast.loading("Enriching from Gmail…");
    try {
      const res = await fetch("/api/enrich/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contactId] }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === "reconnect_required") {
          throw new Error("Reconnect Gmail with read access first.");
        }
        if (body.error === "no_mailbox") {
          throw new Error("Connect Gmail first.");
        }
        throw new Error(`Enrich failed (${res.status})`);
      }
      const j = (await res.json()) as {
        threadsFound?: number;
        scoredCandidates?: string[];
      };
      const found = j.threadsFound ?? 0;
      toast.success(
        found === 0
          ? "No threads found with this contact."
          : `Found ${found} thread${found === 1 ? "" : "s"}.`,
        { id: t },
      );

      // Auto-score if eligible.
      if (j.scoredCandidates?.includes(contactId)) {
        toast.loading("Scoring relationship…", { id: t });
        await fetch(`/api/contacts/${contactId}/scores`, { method: "POST" });
        toast.success("Scored.", { id: t });
      }

      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enrich failed", {
        id: t,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      onClick={run}
      disabled={busy || !hasEmail}
      size={size}
      variant="outline"
      title={hasEmail ? "Find email threads with this contact" : "Add an email to enable enrichment"}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      Enrich
    </Button>
  );
}
