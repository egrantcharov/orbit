"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ArrowUpDown, Pin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { PinButton } from "@/components/app/PinButton";
import { ArchiveButton } from "@/components/app/ArchiveButton";
import { formatRelativeTime } from "@/lib/format";
import { cn, emailDomain } from "@/lib/utils";
export type ContactRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  last_interaction_at: string | null;
  message_count: number;
  is_pinned: boolean;
  is_archived?: boolean;
  company?: string | null;
  job_title?: string | null;
};

type Sort = "recent" | "count" | "name" | "name_desc";

const SORT_LABELS: Record<Sort, string> = {
  recent: "Most recent",
  count: "Most messages",
  name: "Name (A → Z)",
  name_desc: "Name (Z → A)",
};

const DRIFTING_DAYS = 30;
const ACTIVE_DAYS = 7;
const HIGH_VOLUME_THRESHOLD = 10;

type Chip = "drifting" | "active" | "high_volume";
const CHIPS: Array<{ key: Chip; label: string }> = [
  { key: "drifting", label: `Drifting (${DRIFTING_DAYS}d+)` },
  { key: "active", label: `Active (${ACTIVE_DAYS}d)` },
  { key: "high_volume", label: `High volume (${HIGH_VOLUME_THRESHOLD}+)` },
];

function passesChips(c: ContactRow, chips: Set<Chip>): boolean {
  if (chips.size === 0) return true;
  const now = Date.now();
  const ts = c.last_interaction_at ? new Date(c.last_interaction_at).getTime() : 0;
  const ageDays = ts ? (now - ts) / 86_400_000 : Infinity;
  if (chips.has("drifting") && !(ageDays >= DRIFTING_DAYS)) return false;
  if (chips.has("active") && !(ageDays <= ACTIVE_DAYS)) return false;
  if (chips.has("high_volume") && c.message_count < HIGH_VOLUME_THRESHOLD) return false;
  return true;
}

function sortFn(a: ContactRow, b: ContactRow, sort: Sort): number {
  // Pinned-first across all sorts.
  if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
  switch (sort) {
    case "recent": {
      const ta = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      const tb = b.last_interaction_at ? new Date(b.last_interaction_at).getTime() : 0;
      return tb - ta;
    }
    case "count":
      return b.message_count - a.message_count;
    case "name":
      return (a.display_name ?? a.email ?? "").localeCompare(b.display_name ?? b.email ?? "");
    case "name_desc":
      return (b.display_name ?? b.email ?? "").localeCompare(a.display_name ?? a.email ?? "");
  }
}

export function ContactList({ contacts }: { contacts: ContactRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [chips, setChips] = useState<Set<Chip>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => {
        if (
          q &&
          !(c.email ?? "").toLowerCase().includes(q) &&
          !(c.display_name ?? "").toLowerCase().includes(q) &&
          !(c.company ?? "").toLowerCase().includes(q) &&
          !(c.job_title ?? "").toLowerCase().includes(q)
        ) {
          return false;
        }
        return passesChips(c, chips);
      })
      .sort((a, b) => sortFn(a, b, sort));
  }, [contacts, query, sort, chips]);

  function toggleChip(c: Chip) {
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9 h-10 rounded-full bg-card"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="default" className="rounded-full">
              <ArrowUpDown />
              <span className="hidden sm:inline">{SORT_LABELS[sort]}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(v) => setSort(v as Sort)}
            >
              {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {SORT_LABELS[s]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {CHIPS.map((chip) => {
          const active = chips.has(chip.key);
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => toggleChip(chip.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground",
              )}
            >
              {chip.label}
            </button>
          );
        })}
        {chips.size > 0 && (
          <button
            type="button"
            onClick={() => setChips(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          {query
            ? `No contacts match "${query}".`
            : "No contacts match these filters."}
        </div>
      ) : (
        <ul className="rounded-xl border bg-card divide-y">
          {filtered.map((c) => (
            <li key={c.id} className="group">
              <div className="flex items-center gap-2 px-4 py-3 hover:bg-accent/50 transition-colors">
                <Link
                  href={`/app/contact/${c.id}`}
                  className="flex flex-1 items-center gap-4 min-w-0"
                >
                  <ContactAvatar
                    email={c.email ?? ""}
                    displayName={c.display_name}
                    size="md"
                  />
                  <div className="flex flex-1 flex-col min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {c.is_pinned && (
                        <Pin className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400 fill-current" />
                      )}
                      <span className="text-sm font-medium truncate">
                        {c.display_name ?? c.email ?? "(no email)"}
                      </span>
                      {c.email && (
                        <Badge
                          variant="muted"
                          className="hidden sm:inline-flex font-normal"
                        >
                          {emailDomain(c.email)}
                        </Badge>
                      )}
                    </div>
                    {(c.job_title || c.company) ? (
                      <span className="text-xs text-muted-foreground truncate">
                        {[c.job_title, c.company].filter(Boolean).join(" · ")}
                      </span>
                    ) : c.display_name && c.email ? (
                      <span className="text-xs text-muted-foreground truncate">
                        {c.email}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground shrink-0 mr-2">
                    <span>{formatRelativeTime(c.last_interaction_at)}</span>
                    <span>
                      {c.message_count.toLocaleString()}{" "}
                      {c.message_count === 1 ? "msg" : "msgs"}
                    </span>
                  </div>
                </Link>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <PinButton contactId={c.id} pinned={c.is_pinned} size="sm" />
                  <ArchiveButton
                    contactId={c.id}
                    archived={c.is_archived ?? false}
                    size="sm"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Showing {filtered.length.toLocaleString()} of{" "}
        {contacts.length.toLocaleString()} contacts.
      </p>
    </div>
  );
}
