"use client";

import { useState } from "react";
import { CalendarPlus, Send, Loader2 } from "lucide-react";
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

function tomorrowYmd(): string {
  const d = new Date(Date.now() + 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function ScheduleEventModal({
  contactId,
  contactEmail,
  contactName,
  trigger,
}: {
  contactId: string;
  contactEmail: string | null;
  contactName: string | null;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(`Catch up with ${contactName ?? "contact"}`);
  const [date, setDate] = useState(tomorrowYmd());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const disabled = !contactEmail;

  async function submit() {
    if (busy) return;
    if (!contactEmail) return;
    if (!title.trim() || !date || !time) {
      toast.error("Title, date, and time required");
      return;
    }
    setBusy(true);
    const t = toast.loading("Creating event…");
    try {
      const startISO = new Date(`${date}T${time}:00`).toISOString();
      const res = await fetch("/api/calendar/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          summary: title,
          description,
          startISO,
          durationMin: parseInt(duration, 10),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === "reconnect_required") {
          throw new Error("Reconnect Google to schedule (new scopes needed)");
        }
        throw new Error(`Create failed (${res.status})`);
      }
      const j = (await res.json()) as { htmlLink?: string };
      toast.success(
        j.htmlLink
          ? `Event created. Open in Calendar`
          : "Event created",
        {
          id: t,
          action: j.htmlLink
            ? {
                label: "Open",
                onClick: () => window.open(j.htmlLink, "_blank"),
              }
            : undefined,
        },
      );
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" disabled={disabled}>
            <CalendarPlus className="h-4 w-4" />
            Schedule
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule with {contactName ?? "contact"}</DialogTitle>
          <DialogDescription>
            {contactEmail
              ? `Sends a Google Calendar invite to ${contactEmail}.`
              : "This contact has no email address."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Time">
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Duration">
            <select
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              {["15", "30", "45", "60", "90"].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description (optional)">
            <textarea
              className="min-h-[5rem] w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={submit} disabled={busy || disabled}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send invite
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium">{label}</label>
      {children}
    </div>
  );
}
