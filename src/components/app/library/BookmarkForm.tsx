"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function BookmarkForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setIsLoading(true);
    const t = toast.loading("Saving bookmark…");
    try {
      const res = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      toast.success(
        body.bookmark?.title ? `Saved “${body.bookmark.title}”` : "Saved",
        { id: t },
      );
      setUrl("");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed", { id: t });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <Input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a URL — github.com, substack, anything…"
        className="flex-1 h-10 rounded-full bg-card"
        disabled={isLoading}
      />
      <Button type="submit" disabled={isLoading || !url.trim()}>
        {isLoading ? <Loader2 className="animate-spin" /> : <Plus />}
        <span className="hidden sm:inline">Add</span>
      </Button>
    </form>
  );
}
