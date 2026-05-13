"use client";

/**
 * Inline audio player for a voice_memo interaction. The bucket is private,
 * so we lazy-mint a signed URL on the first play click. The URL expires
 * fast (60s) but the <audio> tag will hold its stream once loaded.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function VoiceMemoPlayer({
  contactId,
  interactionId,
  durationMs,
  mime,
}: {
  contactId: string;
  interactionId: string;
  durationMs: number | null;
  mime: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    if (url || loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/contacts/${contactId}/voice/${interactionId}`,
      );
      if (!res.ok) throw new Error(`Sign failed (${res.status})`);
      const j = (await res.json()) as { url: string };
      setUrl(j.url);
      // Defer playback to the next tick so the audio element binds first.
      setTimeout(() => audioRef.current?.play().catch(() => {}), 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load audio");
    } finally {
      setLoading(false);
    }
  }, [contactId, interactionId, url, loading]);

  async function remove() {
    if (deleting) return;
    if (!confirm("Delete this voice memo? The audio is removed permanently.")) {
      return;
    }
    setDeleting(true);
    const t = toast.loading("Deleting…");
    try {
      const res = await fetch(
        `/api/contacts/${contactId}/voice/${interactionId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      toast.success("Voice memo deleted", { id: t });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed", {
        id: t,
      });
    } finally {
      setDeleting(false);
    }
  }

  const seconds = durationMs ? Math.round(durationMs / 1000) : null;
  const lengthLabel = seconds
    ? `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`
    : null;

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
      {url ? (
        <audio
          ref={audioRef}
          src={url}
          controls
          preload="metadata"
          className="h-8 w-full max-w-sm"
        >
          {mime && <source src={url} type={mime} />}
        </audio>
      ) : (
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          Play{lengthLabel ? ` · ${lengthLabel}` : ""}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={remove}
        disabled={deleting}
        className="text-muted-foreground hover:text-destructive"
      >
        {deleting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Delete
      </Button>
    </div>
  );
}
