"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, Activity } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format";

type Client = {
  client_id: string;
  client_name: string;
  scopes_granted: string[];
  redirect_uris: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type AuditRow = {
  id: string;
  client_id: string | null;
  method: string;
  name: string;
  ok: boolean;
  duration_ms: number | null;
  created_at: string;
};

export function ClientList({
  clients,
  recentAudit,
}: {
  clients: Client[];
  recentAudit: AuditRow[];
}) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const active = clients.filter((c) => !c.revoked_at);

  async function revoke(clientId: string, name: string) {
    if (revoking) return;
    if (!confirm(`Revoke ${name}? Any active tokens issued to this client stop working immediately.`)) return;
    setRevoking(clientId);
    const t = toast.loading("Revoking…");
    try {
      const res = await fetch(`/api/mcp/clients/${encodeURIComponent(clientId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Revoke failed (${res.status})`);
      }
      toast.success("Revoked", { id: t });
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed", { id: t });
    } finally {
      setRevoking(null);
    }
  }

  return (
    <>
      <Card className="p-6 flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold tracking-tight">Connected clients</h2>
          <span className="text-xs text-muted-foreground">
            {active.length} active{clients.length > active.length ? ` · ${clients.length - active.length} revoked` : ""}
          </span>
        </div>
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No clients yet. Connect Claude Desktop, Cursor, or your own script using the URL above — the first call walks you through the OAuth flow.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {clients.map((c) => (
              <li
                key={c.client_id}
                className={`rounded-lg border px-4 py-3 flex items-start justify-between gap-3 ${
                  c.revoked_at ? "opacity-50" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium truncate">{c.client_name}</h3>
                    {c.revoked_at && (
                      <Badge variant="muted" className="text-[10px]">
                        revoked
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Created {formatRelativeTime(c.created_at)}
                    {c.last_used_at ? ` · last used ${formatRelativeTime(c.last_used_at)}` : " · never used"}
                  </p>
                  {c.scopes_granted.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {c.scopes_granted.map((s) => (
                        <Badge key={s} variant="muted" className="text-[10px] font-mono">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {!c.revoked_at && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke(c.client_id, c.client_name)}
                    disabled={revoking === c.client_id}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {revoking === c.client_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {recentAudit.length > 0 && (
        <Card className="p-6 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold tracking-tight inline-flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent activity
            </h2>
            <span className="text-xs text-muted-foreground">last 20 calls</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {recentAudit.map((r) => (
              <li
                key={r.id}
                className="text-xs flex items-center justify-between gap-3"
              >
                <span className="font-mono truncate">
                  <span className={r.ok ? "text-emerald-600" : "text-rose-600"}>
                    {r.ok ? "✓" : "✗"}
                  </span>{" "}
                  {r.method} · {r.name}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {r.duration_ms ? `${r.duration_ms}ms · ` : ""}
                  {formatRelativeTime(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
