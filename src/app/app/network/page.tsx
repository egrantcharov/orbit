"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Network as NetworkIcon,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Loader2,
  Pin,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { AddContactModal } from "@/components/app/AddContactModal";
import { cn } from "@/lib/utils";
import type {
  NetworkContact,
  NetworkGroup,
} from "@/app/api/network/tree/route";

type GroupKey = "industry" | "sector" | "company" | "school" | "team";

const GROUP_LABELS: Record<GroupKey, string> = {
  industry: "Industry",
  sector: "Sector",
  company: "Company",
  school: "School",
  team: "Team / Group",
};

const GROUP_OPTIONS: GroupKey[] = ["industry", "sector", "company", "school", "team"];

export default function NetworkPage() {
  const [groupBy, setGroupBy] = useState<GroupKey>("industry");
  const [groups, setGroups] = useState<NetworkGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedCompanies, setExpandedCompanies] = useState<Record<string, boolean>>({});

  const load = useCallback(async (g: GroupKey) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/network/tree?group=${g}`);
      if (!res.ok) throw new Error(`Network load failed (${res.status})`);
      const j = (await res.json()) as { groups: NetworkGroup[] };
      setGroups(j.groups);
      // Auto-expand the largest group.
      if (j.groups[0]) setExpanded({ [j.groups[0].key]: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network load failed");
      setGroups([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(groupBy);
  }, [groupBy, load]);

  // Apply free-text filter on the loaded structure (client-side).
  const filteredGroups = useMemo<NetworkGroup[]>(() => {
    if (!groups) return [];
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    const matches = (c: NetworkContact) =>
      [
        c.display_name,
        c.email,
        c.company,
        c.job_title,
        c.industry,
        c.sector,
        c.team,
        c.school,
        c.location,
        c.met_at,
        c.met_via,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);

    return groups
      .map((g) => {
        if (g.companies) {
          const companies = g.companies
            .map((co) => ({
              ...co,
              contacts: co.contacts.filter(matches),
            }))
            .map((co) => ({ ...co, count: co.contacts.length }))
            .filter((co) => co.count > 0);
          const count = companies.reduce((s, c) => s + c.count, 0);
          return { ...g, companies, count };
        }
        const contacts = (g.contacts ?? []).filter(matches);
        return { ...g, contacts, count: contacts.length };
      })
      .filter((g) => g.count > 0);
  }, [groups, query]);

  const totalShown = filteredGroups.reduce((s, g) => s + g.count, 0);

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-6xl w-full mx-auto flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
            <NetworkIcon className="h-6 w-6 text-muted-foreground" />
            Network
          </h1>
          <p className="text-sm text-muted-foreground">
            Spreadsheet view: pivot your contacts by industry, sector, company,
            school, or team. Click any group to expand.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-56 hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="pl-9 h-9 rounded-full"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(groupBy)}
            disabled={busy}
          >
            <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
            Refresh
          </Button>
          <AddContactModal />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          Group by
        </span>
        {GROUP_OPTIONS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroupBy(g)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              g === groupBy
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground",
            )}
          >
            {GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      {groups === null ? (
        <Card className="p-12 grid place-items-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card className="p-12 text-center flex flex-col items-center gap-3">
          <NetworkIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {query
              ? `No contacts match "${query}".`
              : `No ${GROUP_LABELS[groupBy].toLowerCase()} data yet. Edit a contact to fill it in, or click + Add contact.`}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {totalShown.toLocaleString()} contacts across{" "}
            {filteredGroups.length.toLocaleString()}{" "}
            {GROUP_LABELS[groupBy].toLowerCase()} group
            {filteredGroups.length === 1 ? "" : "s"}.
          </p>
          <ul className="flex flex-col gap-2">
            {filteredGroups.map((g) => {
              const open = expanded[g.key] ?? false;
              return (
                <li key={g.key} className="rounded-xl border bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [g.key]: !open }))
                    }
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-semibold flex-1 truncate">
                      {g.key}
                    </span>
                    <Badge variant="muted" className="font-normal text-xs">
                      {g.count} {g.count === 1 ? "person" : "people"}
                    </Badge>
                  </button>
                  {open && (
                    <div className="border-t">
                      {g.companies ? (
                        <ul className="flex flex-col">
                          {g.companies.map((co) => {
                            const coKey = `${g.key}::${co.name}`;
                            const coOpen = expandedCompanies[coKey] ?? true;
                            return (
                              <li key={co.name} className="border-b last:border-b-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedCompanies((prev) => ({
                                      ...prev,
                                      [coKey]: !coOpen,
                                    }))
                                  }
                                  className="w-full flex items-center gap-3 px-6 py-2.5 text-left hover:bg-accent/30 transition-colors"
                                >
                                  {coOpen ? (
                                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  <span className="text-sm font-medium flex-1 truncate">
                                    {co.name}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground tabular-nums">
                                    {co.count}
                                  </span>
                                </button>
                                {coOpen && <ContactRows contacts={co.contacts} />}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <ContactRows contacts={g.contacts ?? []} />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </main>
  );
}

function ContactRows({ contacts }: { contacts: NetworkContact[] }) {
  if (contacts.length === 0) {
    return (
      <div className="px-8 py-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span>No contacts in this group.</span>
        <AddContactModal
          trigger={
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
              <UserPlus className="h-3 w-3" />
              Add one
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {contacts.map((c) => (
        <li key={c.id}>
          <Link
            href={`/app/contact/${c.id}`}
            className="flex items-center gap-3 px-8 py-2.5 hover:bg-accent/30 transition-colors"
          >
            <ContactAvatar
              email={c.email ?? ""}
              displayName={c.display_name}
              size="sm"
            />
            <div className="flex flex-1 flex-col min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {c.is_pinned && (
                  <Pin className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400 fill-current" />
                )}
                <span className="text-sm font-medium truncate">
                  {c.display_name ?? c.email ?? "(unnamed)"}
                </span>
                {c.linkedin_url && (
                  <a
                    href={c.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {[
                  c.job_title,
                  c.team ? `(${c.team})` : null,
                  c.school ? `· ${c.school}` : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </span>
            </div>
            <ScoreChip value={c.score_keep_in_touch} label="K2T" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ScoreChip({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const tone =
    pct >= 70
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : pct >= 40
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
  return (
    <span
      className={cn(
        "hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums",
        tone,
      )}
      title={`Keep-in-touch score: ${pct}/100`}
    >
      {label} {pct}
    </span>
  );
}
