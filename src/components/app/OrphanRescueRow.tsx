"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/ui/contact-avatar";

type Orphan = {
  id: string;
  email: string | null;
  display_name: string | null;
  message_count: number;
  last_interaction_at: string | null;
};

// Surfaces senders that appeared in enriched threads but aren't in the
// user's network yet. One-click adopt unarchives the stub. If the user has
// no Gmail enrichment yet, this card hides itself.
export function OrphanRescueRow() {
  const router = useRouter();
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/enrich/orphans")
      .then((r) => (r.ok ? r.json() : { orphans: [] }))
      .then((j: { orphans?: Orphan[] }) => {
        if (!cancelled) setOrphans(j.orphans ?? []);
      })
      .catch(() => {
        if (!cancelled) setOrphans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!orphans || orphans.length === 0) return null;

  async function adopt(o: Orphan) {
    setAdopting(o.id);
    const t = toast.loading("Adding…");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: o.email,
          display_name: o.display_name,
        }),
      });
      if (!res.ok) throw new Error(`Add failed (${res.status})`);
      toast.success("Added", { id: t });
      setOrphans((cur) => (cur ?? []).filter((x) => x.id !== o.id));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed", { id: t });
    } finally {
      setAdopting(null);
    }
  }

  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold tracking-tight">
          Frequent senders not in your contacts
        </h2>
        <span className="text-xs text-muted-foreground">
          ({orphans.length})
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        These showed up in your enriched email threads. Adopt the ones you
        actually know.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {orphans.map((o) => (
          <li
            key={o.id}
            className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
          >
            <ContactAvatar
              email={o.email ?? ""}
              displayName={o.display_name}
              size="sm"
            />
            <div className="flex flex-1 flex-col min-w-0">
              <span className="text-sm font-medium truncate">
                {o.display_name ?? o.email}
              </span>
              {o.email && o.display_name && (
                <span className="text-[11px] text-muted-foreground truncate">
                  {o.email}
                </span>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => adopt(o)}
              disabled={adopting === o.id}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
