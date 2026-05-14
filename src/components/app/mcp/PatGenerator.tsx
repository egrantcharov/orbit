"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Key, Copy, Check, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { ALL_SCOPES, SCOPE_LABELS, type Scope } from "@/lib/mcp/scopes";

export function PatGenerator() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Scope[]>([...ALL_SCOPES]);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function reset() {
    setName("");
    setSelectedScopes([...ALL_SCOPES]);
    setToken(null);
    setCopied(false);
  }

  function toggle(s: Scope) {
    setSelectedScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  async function generate() {
    if (busy) return;
    if (selectedScopes.length === 0) {
      toast.error("Pick at least one scope.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/mcp/pat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, scopes: selectedScopes }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j.token) {
        throw new Error(j.message ?? j.error ?? `Generate failed (${res.status})`);
      }
      setToken(j.token);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setBusy(false);
    }
  }

  function copyToken() {
    if (!token) return;
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      toast.success("Copied — paste it somewhere safe");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card className="p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight inline-flex items-center gap-2">
            <Key className="h-4 w-4" />
            Personal access token (PAT)
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            For headless scripts and quick demos. Bypasses the OAuth handshake —
            paste the token directly into any client&apos;s <code className="text-[11px]">Authorization: Bearer …</code>{" "}
            header. Use OAuth for real production clients (Claude Desktop, Cursor).
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!next) reset();
            setOpen(next);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Key className="h-4 w-4" />
              Generate PAT
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{token ? "Save your token" : "Generate a PAT"}</DialogTitle>
              <DialogDescription>
                {token
                  ? "Copy it now — we never show it again. Lose it and you'll need to revoke + generate a new one."
                  : "Choose a name + scopes. Token expires only when you revoke it."}
              </DialogDescription>
            </DialogHeader>

            {!token ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">Token name</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My laptop / smoke-test / Sarah&apos;s bot"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium">Scopes</label>
                  <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                    {ALL_SCOPES.map((s) => {
                      const checked = selectedScopes.includes(s);
                      return (
                        <li key={s} className="flex items-start gap-2.5">
                          <input
                            id={`pat-${s}`}
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(s)}
                            className="mt-1 h-3.5 w-3.5 cursor-pointer"
                          />
                          <label htmlFor={`pat-${s}`} className="cursor-pointer text-xs flex-1">
                            <span className="font-medium">{SCOPE_LABELS[s].title}</span>
                            <span className="text-muted-foreground"> — {SCOPE_LABELS[s].body}</span>
                            <code className="ml-1 text-[10px] text-muted-foreground/70">{s}</code>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button onClick={generate} disabled={busy || selectedScopes.length === 0}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                    Generate
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/20 p-3 text-xs inline-flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
                  <p>
                    This is the only time we&apos;ll show this. Save it in a
                    password manager / .env file now.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium">Your token</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-secondary px-3 py-2 rounded-md font-mono break-all">
                      {token}
                    </code>
                    <Button size="sm" variant="outline" onClick={copyToken}>
                      {copied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="rounded-md bg-secondary p-3 text-xs">
                  <p className="font-medium mb-1">Smoke test it:</p>
                  <pre className="overflow-x-auto whitespace-pre font-mono text-[11px]">
{`curl -X POST https://orbit-drab-phi.vercel.app/api/mcp \\
  -H "Authorization: Bearer ${token.slice(0, 20)}…" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
                  </pre>
                </div>
                <div className="flex justify-end pt-1">
                  <DialogClose asChild>
                    <Button onClick={() => reset()}>I&apos;ve saved it</Button>
                  </DialogClose>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}
