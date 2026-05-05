"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Save,
  Loader2,
  Mic,
  Square,
  Phone,
  MessageSquare,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { InteractionKind } from "@/lib/types/database";

type Kind = Extract<
  InteractionKind,
  "note" | "phone" | "imessage" | "voice_memo"
>;

const KIND_OPTIONS: Array<{ key: Kind; label: string; icon: typeof Mic }> = [
  { key: "note", label: "In-person / note", icon: ClipboardList },
  { key: "phone", label: "Phone call", icon: Phone },
  { key: "imessage", label: "iMessage / chat", icon: MessageSquare },
  { key: "voice_memo", label: "Voice memo", icon: Mic },
];

// Browser SpeechRecognition typing — Chrome/Safari ship this under the
// webkit prefix and there's no canonical TS type. Cast as needed.
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void)
    | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

export function LogInteractionModal({
  contactId,
  contactName,
  trigger,
}: {
  contactId: string;
  contactName: string | null;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [occurredOn, setOccurredOn] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoiceSupported(getSpeechRecognition() !== null);
  }, []);

  function reset() {
    setKind("note");
    setTitle("");
    setBody("");
    setOccurredOn(new Date().toISOString().slice(0, 10));
    setRecording(false);
  }

  function startRecording() {
    const r = getSpeechRecognition();
    if (!r) {
      toast.error("Voice not supported in this browser. Try Chrome or Safari.");
      return;
    }
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (ev) => {
      let chunk = "";
      for (let i = 0; i < ev.results.length; i += 1) {
        chunk += ev.results[i][0].transcript + " ";
      }
      setBody((prev) => (prev ? prev + " " : "") + chunk.trim());
    };
    r.onerror = (ev) => {
      toast.error("Voice error: " + ev.error);
      setRecording(false);
    };
    r.onend = () => setRecording(false);
    r.start();
    recogRef.current = r;
    setRecording(true);
    setKind("voice_memo");
  }

  function stopRecording() {
    recogRef.current?.stop();
    recogRef.current = null;
    setRecording(false);
  }

  async function save() {
    if (busy) return;
    if (!body.trim() && !title.trim()) {
      toast.error("Body or title required");
      return;
    }
    setBusy(true);
    const t = toast.loading("Logging…");
    try {
      const occurredAt =
        occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(occurredOn)
          ? new Date(occurredOn + "T12:00:00Z").toISOString()
          : new Date().toISOString();
      const res = await fetch(`/api/contacts/${contactId}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim() || null,
          body: body.trim() || null,
          occurred_at: occurredAt,
        }),
      });
      if (!res.ok) throw new Error(`Log failed (${res.status})`);
      toast.success("Logged", { id: t });
      reset();
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Log failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <ClipboardList className="h-4 w-4" />
            Log interaction
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Log interaction{contactName ? ` with ${contactName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Capture context that won&apos;t reach Orbit through email — coffee
            chats, phone calls, iMessage threads.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {KIND_OPTIONS.map((o) => {
              const Icon = o.icon;
              const active = kind === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setKind(o.key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-3 py-2 text-xs transition-colors",
                    active
                      ? "border-foreground bg-secondary text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-border",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Coffee at Sweetleaf"
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Body</label>
              {voiceSupported && (
                <Button
                  type="button"
                  variant={recording ? "destructive" : "outline"}
                  size="sm"
                  onClick={() =>
                    recording ? stopRecording() : startRecording()
                  }
                >
                  {recording ? (
                    <>
                      <Square className="h-3 w-3" />
                      Stop
                    </>
                  ) : (
                    <>
                      <Mic className="h-3 w-3" />
                      Record
                    </>
                  )}
                </Button>
              )}
            </div>
            <textarea
              className="min-h-[10rem] w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What happened? Topics covered, what they're working on, follow-ups."
            />
            {recording && (
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                Listening — speak naturally; tap Stop when done.
              </p>
            )}
            {!voiceSupported && (
              <p className="text-[11px] text-muted-foreground">
                Voice transcription needs Chrome/Edge/Safari. Type instead.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
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
