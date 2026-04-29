"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ArrowUpDown } from "lucide-react";
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
import { formatRelativeTime } from "@/lib/format";
import { emailDomain } from "@/lib/utils";

export type ContactRow = {
  id: string;
  email: string;
  display_name: string | null;
  last_interaction_at: string | null;
  message_count: number;
};

type Sort = "recent" | "count" | "name" | "name_desc";

const SORT_LABELS: Record<Sort, string> = {
  recent: "Most recent",
  count: "Most messages",
  name: "Name (A → Z)",
  name_desc: "Name (Z → A)",
};

function sortFn(a: ContactRow, b: ContactRow, sort: Sort): number {
  switch (sort) {
    case "recent": {
      const ta = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      const tb = b.last_interaction_at ? new Date(b.last_interaction_at).getTime() : 0;
      return tb - ta;
    }
    case "count":
      return b.message_count - a.message_count;
    case "name":
      return (a.display_name ?? a.email).localeCompare(b.display_name ?? b.email);
    case "name_desc":
      return (b.display_name ?? b.email).localeCompare(a.display_name ?? a.email);
  }
}

export function ContactList({ contacts }: { contacts: ContactRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? contacts.filter(
          (c) =>
            c.email.toLowerCase().includes(q) ||
            (c.display_name ?? "").toLowerCase().includes(q),
        )
      : contacts;
    return [...base].sort((a, b) => sortFn(a, b, sort));
  }, [contacts, query, sort]);

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

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          {query
            ? `No contacts match "${query}".`
            : "No contacts yet — try syncing again."}
        </div>
      ) : (
        <ul className="rounded-xl border bg-card divide-y">
          {filtered.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/contact/${c.id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-accent/50 transition-colors"
              >
                <ContactAvatar
                  email={c.email}
                  displayName={c.display_name}
                  size="md"
                />
                <div className="flex flex-1 flex-col min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {c.display_name ?? c.email}
                    </span>
                    <Badge variant="muted" className="hidden sm:inline-flex font-normal">
                      {emailDomain(c.email)}
                    </Badge>
                  </div>
                  {c.display_name && (
                    <span className="text-xs text-muted-foreground truncate">
                      {c.email}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground shrink-0">
                  <span>{formatRelativeTime(c.last_interaction_at)}</span>
                  <span>
                    {c.message_count.toLocaleString()}{" "}
                    {c.message_count === 1 ? "msg" : "msgs"}
                  </span>
                </div>
              </Link>
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
