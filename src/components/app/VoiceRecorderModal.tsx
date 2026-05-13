"use client";

/**
 * Voice recorder for a contact card. Two parallel streams:
 *   1) MediaRecorder writes an actual audio blob (opus/webm in Chrome,
 *      mp4 in Safari). That gets uploaded to Supabase Storage so the user
 *      can play the call back later.
 *   2) The browser's SpeechRecognition (where available) gives a live
 *      transcript that ships alongside the audio. No second API hop.
 *
 * Server enforces the real caps; the UI just stops politely at 30 minutes
 * so the user doesn't watch a recording fail at the end.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Loader2, Save, Trash2, AudioLines } from "lucide-react";
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

const SOFT_DURATION_CAP_MS = 30 * 60 * 1000; // 30 min — server enforces the hard cap

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((ev: {
        resultIndex: number;
        results: ArrayLike<{
          isFinal: boolean;
          0: { transcript: string };
        }>;
      }) => void)
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
  return Ctor ? new Ctor() : null;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // ignore
    }
  }
  return "audio/webm";
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorderModal({
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
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMime, setAudioMime] = useState<string>("audio/webm");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopOnCapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (stopOnCapTimerRef.current) {
      clearTimeout(stopOnCapTimerRef.current);
      stopOnCapTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      teardown();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // intentionally ignore previewUrl in deps — revoke happens on unmount via the closure capture above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teardown]);

  function reset() {
    teardown();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setTitle("");
    setTranscript("");
    setInterim("");
    setRecording(false);
    setElapsedMs(0);
    setAudioBlob(null);
    setAudioMime("audio/webm");
    setPreviewUrl(null);
  }

  async function startRecording() {
    if (recording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Recording isn't supported in this browser.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Mic denied: ${err.message}`
          : "Mic permission denied.",
      );
      return;
    }
    streamRef.current = stream;
    const mime = pickMime();
    setAudioMime(mime);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      recorder = new MediaRecorder(stream);
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || mime,
      });
      chunksRef.current = [];
      setAudioBlob(blob);
      setAudioMime(recorder.mimeType || mime);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    };
    recorder.start(1000);
    recorderRef.current = recorder;

    // Parallel speech recognition where available.
    const recog = getSpeechRecognition();
    if (recog) {
      recog.continuous = true;
      recog.interimResults = true;
      recog.lang = "en-US";
      recog.onresult = (ev) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          const r = ev.results[i];
          const text = r[0].transcript;
          if (r.isFinal) finalChunk += text + " ";
          else interimChunk += text + " ";
        }
        if (finalChunk) {
          setTranscript((prev) =>
            (prev ? prev + " " : "") + finalChunk.trim(),
          );
        }
        setInterim(interimChunk.trim());
      };
      recog.onerror = () => {
        // Soft-fail; the audio is what matters.
      };
      recog.onend = () => {
        setInterim("");
      };
      try {
        recog.start();
        recognitionRef.current = recog;
      } catch {
        recognitionRef.current = null;
      }
    }

    startedAtRef.current = Date.now();
    setElapsedMs(0);
    tickerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 250);
    stopOnCapTimerRef.current = setTimeout(() => {
      toast.info("Reached the 30-minute cap — stopping the recording.");
      stopRecording();
    }, SOFT_DURATION_CAP_MS);
    setRecording(true);
  }

  function stopRecording() {
    if (!recording) return;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (stopOnCapTimerRef.current) {
      clearTimeout(stopOnCapTimerRef.current);
      stopOnCapTimerRef.current = null;
    }
    setRecording(false);
  }

  async function save() {
    if (!audioBlob) {
      toast.error("Record something first.");
      return;
    }
    if (saving) return;
    setSaving(true);
    const t = toast.loading("Saving voice memo…");
    try {
      const form = new FormData();
      form.append("audio", audioBlob, `memo.${audioMime.includes("mp4") ? "m4a" : "webm"}`);
      form.append("duration_ms", String(elapsedMs));
      if (title.trim()) form.append("title", title.trim());
      if (transcript.trim()) form.append("transcript", transcript.trim());
      const res = await fetch(`/api/contacts/${contactId}/voice`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Upload failed (${res.status})`);
      }
      toast.success("Saved", { id: t });
      reset();
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed", {
        id: t,
      });
    } finally {
      setSaving(false);
    }
  }

  const displayedTranscript = [transcript, interim].filter(Boolean).join(" ");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Mic className="h-4 w-4" />
            Record call
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Record a call{contactName ? ` with ${contactName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Audio attaches to the contact. We transcribe live in-browser so it
            shows up on the activity log too — edit the transcript before
            saving if you want.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div
            className={cn(
              "rounded-xl border bg-card p-5 flex flex-col items-center gap-4",
              recording && "border-rose-300/70 dark:border-rose-700/60",
            )}
          >
            <button
              type="button"
              onClick={() => (recording ? stopRecording() : startRecording())}
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-full text-white transition-colors",
                recording
                  ? "bg-rose-600 hover:bg-rose-700 animate-pulse"
                  : "bg-foreground hover:bg-foreground/90",
              )}
              aria-label={recording ? "Stop recording" : "Start recording"}
            >
              {recording ? (
                <Square className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </button>
            <div className="text-center">
              <div className="text-2xl font-mono tabular-nums tracking-tight">
                {formatClock(elapsedMs)}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">
                {recording
                  ? "Listening — tap stop when done"
                  : audioBlob
                    ? "Recorded — review below"
                    : "Tap the mic to start"}
              </div>
            </div>
            {previewUrl && (
              <audio
                src={previewUrl}
                controls
                className="w-full max-w-sm"
                preload="metadata"
              />
            )}
            {audioBlob && !recording && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setAudioBlob(null);
                  setPreviewUrl(null);
                  setTranscript("");
                  setInterim("");
                  setElapsedMs(0);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Discard & re-record
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium">Title (optional)</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Catch-up call, Tuesday"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Transcript</label>
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <AudioLines className="h-3 w-3" />
                Live in-browser
              </span>
            </div>
            <textarea
              className="min-h-[8rem] w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
              value={displayedTranscript}
              onChange={(e) => {
                setTranscript(e.target.value);
                setInterim("");
              }}
              placeholder="Speak naturally — the transcript shows up here. Edit anything that came out wrong before saving."
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={save} disabled={saving || !audioBlob}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save memo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
