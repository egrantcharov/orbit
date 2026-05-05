"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import {
  Search,
  RefreshCw,
  Mail,
  ArrowLeft,
  Reply,
  Send,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { cn } from "@/lib/utils";

type ThreadSummary = {
  id: string;
  subject: string | null;
  from: string | null;
  date: string | null;
  snippet: string | null;
  unread: boolean;
};

type Message = {
  id: string | null;
  from: string | null;
  to: string | null;
  cc: string | null;
  subject: string | null;
  date: string | null;
  snippet: string | null;
  body: string | null;
};

function parseFrom(from: string | null): { name: string; email: string } {
  if (!from) return { name: "", email: "" };
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: from.trim() };
}

function relativeDate(d: string | null): string {
  if (!d) return "";
  const ts = new Date(d).getTime();
  if (Number.isNaN(ts)) return "";
  const ageH = (Date.now() - ts) / 3_600_000;
  if (ageH < 1) return `${Math.max(1, Math.round(ageH * 60))}m ago`;
  if (ageH < 24) return `${Math.round(ageH)}h ago`;
  if (ageH < 24 * 7) return `${Math.round(ageH / 24)}d ago`;
  return new Date(d).toLocaleDateString();
}

export default function InboxPage() {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const load = useCallback(
    async (q?: string) => {
      setBusy(true);
      try {
        const url = q ? `/api/inbox/list?q=${encodeURIComponent(q)}` : "/api/inbox/list";
        const res = await fetch(url);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (j.error === "reconnect_required") {
            toast.error("Reconnect Gmail with read access first.");
            setThreads([]);
            return;
          }
          if (j.error === "no_mailbox") {
            toast.error("Connect Gmail first.");
            setThreads([]);
            return;
          }
          throw new Error(`Inbox load failed (${res.status})`);
        }
        const j = (await res.json()) as { threads: ThreadSummary[] };
        setThreads(j.threads);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Inbox load failed");
        setThreads([]);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function openThread(id: string) {
    setActiveId(id);
    setActiveMessages(null);
    try {
      const res = await fetch(`/api/inbox/thread/${id}`);
      if (!res.ok) throw new Error(`Thread load failed (${res.status})`);
      const j = (await res.json()) as { messages: Message[] };
      setActiveMessages(j.messages);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Thread load failed");
    }
  }

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-6xl w-full mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Native Gmail view — search, read, and reply without leaving Orbit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64 hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(query);
              }}
              placeholder="Search Gmail (q=…)"
              className="pl-9 h-9 rounded-full"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => startTransition(() => void load(query))}
            disabled={busy}
          >
            <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Left: thread list */}
        <Card className="overflow-hidden flex flex-col h-[calc(100vh-220px)]">
          {threads === null ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : threads.length === 0 ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground p-6 text-center">
              <div>
                <Mail className="h-5 w-5 mx-auto mb-2 opacity-60" />
                No threads. Try a different query, or reconnect Gmail.
              </div>
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto divide-y">
              {threads.map((t) => {
                const { name, email } = parseFrom(t.from);
                const isActive = t.id === activeId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => void openThread(t.id)}
                      className={cn(
                        "w-full text-left px-3 py-3 flex items-start gap-3 hover:bg-accent/50 transition-colors",
                        isActive && "bg-accent",
                      )}
                    >
                      <ContactAvatar
                        email={email}
                        displayName={name || null}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "text-sm truncate",
                              t.unread ? "font-semibold" : "font-medium",
                            )}
                          >
                            {name || email || "(unknown)"}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {relativeDate(t.date)}
                          </span>
                        </div>
                        <span className="text-xs text-foreground/90 truncate">
                          {t.subject ?? "(no subject)"}
                        </span>
                        <span className="text-[11px] text-muted-foreground line-clamp-1">
                          {t.snippet}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Right: thread detail */}
        <Card className="overflow-hidden flex flex-col h-[calc(100vh-220px)]">
          {!activeId ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground p-6 text-center">
              <div>
                <Mail className="h-5 w-5 mx-auto mb-2 opacity-60" />
                Pick a thread to read it here.
              </div>
            </div>
          ) : activeMessages === null ? (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <ThreadDetail
              messages={activeMessages}
              onBack={() => {
                setActiveId(null);
                setActiveMessages(null);
              }}
            />
          )}
        </Card>
      </div>
    </main>
  );
}

function ThreadDetail({
  messages,
  onBack,
}: {
  messages: Message[];
  onBack: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  const subject = messages[0]?.subject ?? "(no subject)";
  const lastIncoming = [...messages].reverse().find((m) => m.from);
  const replyTo = lastIncoming ? parseFrom(lastIncoming.from).email : "";

  async function send() {
    if (sending) return;
    if (!replyTo || !replyBody.trim()) {
      toast.error("Body required");
      return;
    }
    setSending(true);
    const t = toast.loading("Sending…");
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: replyTo,
          subject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
          body: replyBody,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === "reconnect_required") {
          throw new Error("Reconnect Gmail to send.");
        }
        throw new Error(`Send failed (${res.status})`);
      }
      toast.success("Sent", { id: t });
      setReplyOpen(false);
      setReplyBody("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed", { id: t });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 lg:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base font-semibold tracking-tight truncate">
            {subject}
          </h2>
          <Badge variant="muted" className="font-normal">
            {messages.length} message{messages.length === 1 ? "" : "s"}
          </Badge>
        </div>
        <Button size="sm" onClick={() => setReplyOpen((v) => !v)}>
          <Reply className="h-4 w-4" />
          Reply
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((m, i) => {
          const { name, email } = parseFrom(m.from);
          return (
            <div key={m.id ?? i} className="flex gap-3">
              <ContactAvatar
                email={email}
                displayName={name || null}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {name || email || "(unknown)"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {relativeDate(m.date)}
                  </span>
                </div>
                {m.to && (
                  <div className="text-[11px] text-muted-foreground truncate">
                    to {m.to}
                  </div>
                )}
                <div className="mt-2 text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                  {m.body ?? m.snippet ?? "(empty)"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {replyOpen && (
        <div className="border-t p-4 flex flex-col gap-2 bg-secondary/30">
          <div className="text-xs text-muted-foreground">
            Replying to{" "}
            <span className="font-medium text-foreground">{replyTo}</span>
          </div>
          <textarea
            className="min-h-[8rem] w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write your reply…"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReplyOpen(false)}>
              Cancel
            </Button>
            <Button onClick={send} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

