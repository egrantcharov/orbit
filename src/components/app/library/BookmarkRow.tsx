"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Trash2,
  Code,
  Mail,
  FileText,
  Wrench,
  Bookmark as BookmarkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BookmarkKind } from "@/lib/types/database";
import { formatRelativeTime } from "@/lib/format";

const KIND_ICON: Record<BookmarkKind, React.ComponentType<{ className?: string }>> = {
  github: Code,
  newsletter: Mail,
  article: FileText,
  tool: Wrench,
  other: BookmarkIcon,
};

const KIND_LABEL: Record<BookmarkKind, string> = {
  github: "GitHub",
  newsletter: "Newsletter",
  article: "Article",
  tool: "Tool",
  other: "Other",
};

export type BookmarkRowData = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  kind: BookmarkKind;
  tags: string[];
  created_at: string;
};

export function BookmarkRow({ bookmark }: { bookmark: BookmarkRowData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  let host = bookmark.url;
  try {
    host = new URL(bookmark.url).hostname;
  } catch {
    /* keep raw URL */
  }

  const Icon = KIND_ICON[bookmark.kind];
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;

  async function remove() {
    if (!confirm("Remove this bookmark?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bookmarks?id=${bookmark.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Remove failed (${res.status})`);
      toast.success("Bookmark removed");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 flex items-start gap-4 group">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={favicon}
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 rounded"
          loading="lazy"
          aria-hidden
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-start gap-2">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline truncate flex-1 min-w-0"
          >
            {bookmark.title ?? bookmark.url}
          </a>
          <Badge variant="muted" className="font-normal text-[10px] shrink-0">
            <Icon className="h-3 w-3" />
            {KIND_LABEL[bookmark.kind]}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground truncate">{host}</span>
        {bookmark.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
            {bookmark.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
          <span>Saved {formatRelativeTime(bookmark.created_at)}</span>
          {bookmark.tags.length > 0 && (
            <>
              <span>·</span>
              <span>{bookmark.tags.map((t) => `#${t}`).join(" ")}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
        >
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open bookmark"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={remove}
          disabled={busy}
          aria-label="Remove bookmark"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}
