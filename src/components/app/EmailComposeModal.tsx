"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EmailComposeModal({
  contactId,
  contactEmail,
  contactName,
  fromEmail,
  defaultSubject = "",
  defaultBody = "",
  trigger,
}: {
  contactId: string;
  contactEmail: string | null;
  contactName: string | null;
  fromEmail: string | null;
  defaultSubject?: string;
  defaultBody?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [intent, setIntent] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();

  const disabled = !contactEmail;

  async function draft() {
    if (drafting) return;
    setDrafting(true);
    const t = toast.loading("Drafting…");
    try {
      const res = await fetch("/api/email/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, intent: intent.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`Draft failed (${res.status})`);
      const j = (await res.json()) as { subject?: string; body?: string };
      if (j.subject) setSubject(j.subject);
      if (j.body) setBody(j.body);
      toast.success("Drafted", { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Draft failed", { id: t });
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (sending) return;
    if (!contactEmail) return;
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body required");
      return;
    }
    setSending(true);
    const t = toast.loading("Sending…");
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, subject, body }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === "reconnect_required") {
          throw new Error("Reconnect Google to send (new scopes needed)");
        }
        throw new Error(`Send failed (${res.status})`);
      }
      toast.success("Sent", { id: t });
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed", { id: t });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" disabled={disabled}>
            <Mail className="h-4 w-4" />
            Email
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Email {contactName ?? contactEmail ?? "contact"}</DialogTitle>
          <DialogDescription>
            {fromEmail ? `Sending from ${fromEmail}` : "Connect Google to send"}
            {contactEmail ? ` · to ${contactEmail}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs font-medium">Intent (optional)</label>
              <Input
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="follow up after our coffee · happy birthday · share an article"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={draft}
              disabled={drafting || disabled}
            >
              {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Draft with Claude
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Body</label>
            <textarea
              className="min-h-[14rem] w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                disabled
                  ? "This contact has no email address."
                  : "Type a message, or click Draft with Claude to start."
              }
              disabled={disabled}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={send} disabled={sending || disabled}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
