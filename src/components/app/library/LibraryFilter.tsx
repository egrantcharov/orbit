"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  BOOKMARK_KINDS,
  type BookmarkKind,
} from "@/lib/types/database";
import { BookmarkRow, type BookmarkRowData } from "./BookmarkRow";

const KIND_LABELS: Record<BookmarkKind | "all", string> = {
  all: "All",
  github: "GitHub",
  newsletter: "Newsletters",
  article: "Articles",
  tool: "Tools",
  other: "Other",
};

export function LibraryFilter({ bookmarks }: { bookmarks: BookmarkRowData[] }) {
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<BookmarkKind | "all">("all");

  const counts = useMemo(() => {
    const c: Record<BookmarkKind | "all", number> = {
      all: bookmarks.length,
      github: 0,
      newsletter: 0,
      article: 0,
      tool: 0,
      other: 0,
    };
    for (const b of bookmarks) c[b.kind] += 1;
    return c;
  }, [bookmarks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookmarks.filter((b) => {
      if (activeKind !== "all" && b.kind !== activeKind) return false;
      if (q) {
        const haystack = [
          b.title ?? "",
          b.url,
          b.description ?? "",
          b.tags.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [bookmarks, query, activeKind]);

  const tabs: Array<BookmarkKind | "all"> = ["all", ...BOOKMARK_KINDS];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, URL, tag…"
          className="pl-9 h-10 rounded-full bg-card"
        />
      </div>

      <div className="flex border-b -mb-px overflow-x-auto scrollbar-thin">
        {tabs.map((t) => {
          const isActive = t === activeKind;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveKind(t)}
              className={cn(
                "px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {KIND_LABELS[t]}
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                {counts[t].toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          {query
            ? `No bookmarks match "${query}".`
            : bookmarks.length === 0
              ? "No bookmarks yet — paste a URL above to add your first."
              : "Nothing in this category yet."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((b) => (
            <li key={b.id}>
              <BookmarkRow bookmark={b} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
