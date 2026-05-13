"use client";

/**
 * "Your data" section on /app/settings — surfaces the GDPR-style export and
 * delete-my-data endpoints. The delete flow requires the user to type
 * DELETE into the confirm field and clicks twice; export streams a JSON
 * blob the user saves locally.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Download, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DataControls() {
  const { signOut } = useClerk();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function downloadExport() {
    if (exporting) return;
    setExporting(true);
    const t = toast.loading("Building export…");
    try {
      const res = await fetch("/api/me/export");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `orbit-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Export downloaded", { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed", {
        id: t,
      });
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    if (deleting) return;
    if (confirm !== "DELETE") {
      toast.error('Type DELETE in the confirm box first.');
      return;
    }
    if (
      !window.confirm(
        "This permanently removes every Orbit row about you (contacts, threads, interactions, voice memos, briefings, lists). Continue?",
      )
    ) {
      return;
    }
    setDeleting(true);
    const t = toast.loading("Deleting your data…");
    try {
      const res = await fetch("/api/me/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Delete failed (${res.status})`);
      }
      toast.success("Everything erased. Signing you out…", { id: t });
      await signOut(() => router.push("/"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed", {
        id: t,
      });
      setDeleting(false);
    }
  }

  return (
    <Card className="p-6 flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Your data</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Export everything Orbit knows about you, or wipe it. We never share
          either path with anyone — the export is a local download, the delete
          is a permanent erase.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium">Download a copy</h3>
          <p className="text-xs text-muted-foreground mt-1">
            One JSON file with every contact, thread participant link,
            interaction, voice-memo reference, briefing, list, bookmark, and
            digest tied to your account. Voice audio stays on the server —
            grab individual files from each contact card if you need them.
          </p>
        </div>
        <div>
          <Button onClick={downloadExport} disabled={exporting} variant="outline">
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download export
          </Button>
        </div>
      </div>

      <div className="border-t pt-6 flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-medium text-destructive">
              Delete everything
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Cascades through every Orbit table tied to your Clerk user — and
              wipes the voice-memo storage bucket. Sign-in still works after;
              you&apos;ll just land in a fresh, empty Orbit.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type DELETE to enable"
            className="sm:max-w-xs"
          />
          <Button
            onClick={deleteAccount}
            disabled={deleting || confirm !== "DELETE"}
            variant="destructive"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Erase my data
          </Button>
        </div>
      </div>
    </Card>
  );
}
