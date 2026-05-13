"use client";

import { useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Scope } from "@/lib/mcp/scopes";

export function ConsentForm({
  clientName,
  requestedScopes,
  scopeLabels,
}: {
  clientName: string;
  requestedScopes: Scope[];
  scopeLabels: Record<Scope, { title: string; body: string }>;
}) {
  const [granted, setGranted] = useState<Scope[]>(requestedScopes);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  async function submit(approve: boolean) {
    if (busy) return;
    setBusy(approve ? "approve" : "deny");
    try {
      const res = await fetch("/api/mcp/oauth/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve, scopes: granted }),
      });
      const j = (await res.json().catch(() => ({}))) as { redirect?: string; error?: string };
      if (!res.ok) {
        toast.error(j.error ?? `Consent failed (${res.status})`);
        setBusy(null);
        return;
      }
      if (j.redirect) {
        window.location.href = j.redirect;
      } else {
        toast.success(approve ? "Authorized" : "Denied");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Consent failed");
      setBusy(null);
    }
  }

  function toggle(s: Scope) {
    setGranted((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <p className="text-sm">
        <span className="font-medium">{clientName}</span> is requesting:
      </p>
      <ul className="flex flex-col gap-3">
        {requestedScopes.map((s) => {
          const checked = granted.includes(s);
          const label = scopeLabels[s];
          if (!label) return null;
          return (
            <li key={s} className="flex items-start gap-3">
              <input
                type="checkbox"
                id={`scope-${s}`}
                checked={checked}
                onChange={() => toggle(s)}
                className="mt-1 h-4 w-4 cursor-pointer"
              />
              <label htmlFor={`scope-${s}`} className="cursor-pointer flex-1">
                <div className="text-sm font-medium">{label.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label.body}</div>
                <code className="text-[10px] text-muted-foreground/70">{s}</code>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button
          variant="outline"
          onClick={() => submit(false)}
          disabled={!!busy}
        >
          {busy === "deny" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <X className="h-4 w-4" />
          )}
          Deny
        </Button>
        <Button
          onClick={() => submit(true)}
          disabled={!!busy || granted.length === 0}
        >
          {busy === "approve" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Authorize
        </Button>
      </div>
    </Card>
  );
}
