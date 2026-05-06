"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ListChecks,
  Plus,
  Trash2,
  Loader2,
  Save,
  X,
  Filter,
  Pin,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { cn } from "@/lib/utils";
import type { ListFilter } from "@/lib/types/database";

type ListSummary = {
  id: string;
  name: string;
  description: string | null;
  filter: ListFilter;
  stages: string[] | null;
  count: number;
  created_at: string;
};

type ListContact = {
  id: string;
  email: string | null;
  display_name: string | null;
  company: string | null;
  job_title: string | null;
  industry: string | null;
  sector: string | null;
  team: string | null;
  is_pinned: boolean;
  score_keep_in_touch: number | null;
  last_interaction_at: string | null;
  stage: string | null;
};

type ListDetail = {
  list: ListSummary;
  contacts: ListContact[];
};

export default function ListsPage() {
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ListDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLists = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/lists");
      if (!res.ok) throw new Error(`Lists load failed (${res.status})`);
      const j = (await res.json()) as { lists: ListSummary[] };
      setLists(j.lists);
      if (!activeId && j.lists[0]) setActiveId(j.lists[0].id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lists load failed");
      setLists([]);
    } finally {
      setBusy(false);
    }
  }, [activeId]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/lists/${id}`);
      if (!res.ok) throw new Error(`List detail failed (${res.status})`);
      const j = (await res.json()) as ListDetail;
      setDetail(j);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "List detail failed");
      setDetail(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    if (activeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadDetail(activeId);
    } else {
      setDetail(null);
    }
  }, [activeId, loadDetail]);

  async function setStage(contactId: string, stage: string | null) {
    if (!activeId) return;
    try {
      const res = await fetch(
        `/api/lists/${activeId}/contacts/${contactId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage }),
        },
      );
      if (!res.ok) throw new Error(`Stage update failed (${res.status})`);
      // Optimistic local update
      setDetail((cur) =>
        cur
          ? {
              ...cur,
              contacts: cur.contacts.map((c) =>
                c.id === contactId ? { ...c, stage } : c,
              ),
            }
          : cur,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Stage update failed");
    }
  }

  async function removeFromList(contactId: string) {
    if (!activeId) return;
    if (!confirm("Remove this contact from the list?")) return;
    try {
      const res = await fetch(
        `/api/lists/${activeId}/contacts/${contactId}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) throw new Error(`Remove failed (${res.status})`);
      toast.success("Removed");
      void loadDetail(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  }

  async function deleteList() {
    if (!activeId) return;
    if (!confirm(`Delete the list "${detail?.list.name}"?`)) return;
    try {
      const res = await fetch(`/api/lists/${activeId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      toast.success("Deleted");
      setActiveId(null);
      setDetail(null);
      void loadLists();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-6xl w-full mx-auto flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-muted-foreground" />
            Lists
          </h1>
          <p className="text-sm text-muted-foreground">
            Saved filter combinations + optional pipeline stages. Use them to
            track recruiting funnels, fundraising outreach, or any
            project-based slice of your network.
          </p>
        </div>
        <NewListDialog onCreated={() => void loadLists()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <Card className="p-3 flex flex-col gap-1 h-fit lg:sticky lg:top-20">
          {lists === null ? (
            <div className="p-4 text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              loading…
            </div>
          ) : lists.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground">
              No lists yet. Click + New list.
            </div>
          ) : (
            lists.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setActiveId(l.id)}
                className={cn(
                  "text-left rounded-md px-2.5 py-2 text-sm transition-colors flex items-center gap-2",
                  activeId === l.id
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="flex-1 truncate">{l.name}</span>
                <span className="text-[11px] tabular-nums opacity-70">
                  {l.count}
                </span>
              </button>
            ))
          )}
        </Card>

        {/* Detail */}
        <div className="flex flex-col gap-3 min-w-0">
          {!detail ? (
            <Card className="p-12 text-center text-sm text-muted-foreground">
              {lists && lists.length === 0
                ? "Create your first list to get started."
                : "Pick a list on the left."}
            </Card>
          ) : (
            <ListDetailView
              detail={detail}
              onStageChange={setStage}
              onRemove={removeFromList}
              onDelete={deleteList}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function ListDetailView({
  detail,
  onStageChange,
  onRemove,
  onDelete,
}: {
  detail: ListDetail;
  onStageChange: (contactId: string, stage: string | null) => void;
  onRemove: (contactId: string) => void;
  onDelete: () => void;
}) {
  const { list, contacts } = detail;
  const stages = list.stages ?? [];
  const stageCounts = stages.reduce<Record<string, number>>((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
  for (const c of contacts) {
    if (c.stage && stageCounts[c.stage] != null) {
      stageCounts[c.stage] += 1;
    }
  }
  const filterChips: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(list.filter ?? {})) {
    if (Array.isArray(v) && v.length > 0) {
      filterChips.push([k, v.join(", ")]);
    } else if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") {
      filterChips.push([k, String(v)]);
    }
  }

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{list.name}</h2>
          {list.description && (
            <p className="text-sm text-muted-foreground">{list.description}</p>
          )}
          {filterChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1 items-center">
              <Filter className="h-3 w-3 text-muted-foreground" />
              {filterChips.map(([k, v]) => (
                <Badge key={k} variant="muted" className="font-normal text-[10px]">
                  {k.replace(/_/g, " ")}: {v}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-rose-500">
          <Trash2 className="h-3 w-3" />
          Delete list
        </Button>
      </div>

      {stages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {stages.map((s) => (
            <Badge key={s} variant="muted" className="font-normal">
              {s} · <span className="tabular-nums">{stageCounts[s] ?? 0}</span>
            </Badge>
          ))}
          <Badge variant="muted" className="font-normal text-muted-foreground">
            unstaged ·{" "}
            <span className="tabular-nums">
              {contacts.filter((c) => !c.stage).length}
            </span>
          </Badge>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="rounded-md border bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
          No contacts match this list yet. Adjust the filter or add contacts
          manually from a contact&apos;s page.
        </div>
      ) : (
        <ul className="flex flex-col">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-md hover:bg-accent/30 transition-colors px-2 py-2 border-b last:border-b-0"
            >
              <Link
                href={`/app/contact/${c.id}`}
                className="flex flex-1 items-center gap-3 min-w-0"
              >
                <ContactAvatar
                  email={c.email ?? ""}
                  displayName={c.display_name}
                  size="sm"
                />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {c.is_pinned && (
                      <Pin className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400 fill-current" />
                    )}
                    <span className="text-sm font-medium truncate">
                      {c.display_name ?? c.email ?? "(unnamed)"}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {[c.job_title, c.company, c.team].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </Link>
              {stages.length > 0 && (
                <select
                  className="h-7 rounded-md border bg-background px-2 text-xs"
                  value={c.stage ?? ""}
                  onChange={(e) =>
                    onStageChange(c.id, e.target.value || null)
                  }
                >
                  <option value="">— stage —</option>
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                className="text-muted-foreground hover:text-rose-500 px-1"
                title="Remove from list"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NewListDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState("");
  // Filter inputs (comma-separated multi-selects)
  const [industry, setIndustry] = useState("");
  const [company, setCompany] = useState("");
  const [team, setTeam] = useState("");
  const [school, setSchool] = useState("");
  const [tags, setTags] = useState("");
  const [daysSince, setDaysSince] = useState("");
  const [minK2T, setMinK2T] = useState("");
  const [searchText, setSearchText] = useState("");

  function reset() {
    setName("");
    setDescription("");
    setStages("");
    setIndustry("");
    setCompany("");
    setTeam("");
    setSchool("");
    setTags("");
    setDaysSince("");
    setMinK2T("");
    setSearchText("");
  }

  function csv(s: string): string[] | undefined {
    const arr = s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  }

  async function create() {
    if (busy) return;
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    setBusy(true);
    const t = toast.loading("Creating…");
    try {
      const filter: ListFilter = {};
      const ind = csv(industry);
      if (ind) filter.industry = ind;
      const co = csv(company);
      if (co) filter.company = co;
      const tm = csv(team);
      if (tm) filter.team = tm;
      const sc = csv(school);
      if (sc) filter.school = sc;
      const tg = csv(tags);
      if (tg) filter.tags_any = tg;
      const ds = parseInt(daysSince, 10);
      if (!Number.isNaN(ds) && ds > 0) filter.days_since_interaction_gte = ds;
      const k = parseFloat(minK2T);
      if (!Number.isNaN(k)) filter.min_keep_in_touch = Math.max(0, Math.min(1, k));
      if (searchText.trim()) filter.search_text = searchText.trim();
      const stageList = csv(stages);

      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          filter,
          stages: stageList,
        }),
      });
      if (!res.ok) throw new Error(`Create failed (${res.status})`);
      toast.success("List created", { id: t });
      reset();
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New list
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a list</DialogTitle>
          <DialogDescription>
            Saved filter — contacts that match show up automatically. Add
            stages for a pipeline (e.g., Reached Out, Responded, Called).
            Leave stages empty for a plain saved filter.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="IB Recruiting · Spring 2026"
            />
          </Field>
          <Field label="Description (optional)">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tracking outreach to bulge-bracket TMT analysts"
            />
          </Field>
          <Field
            label="Stages (comma separated, optional)"
            hint="Empty = no pipeline, just a saved filter"
          >
            <Input
              value={stages}
              onChange={(e) => setStages(e.target.value)}
              placeholder="Reached Out, Responded, Called, Followed Up"
            />
          </Field>
          <div className="rounded-lg border bg-secondary/30 p-3 flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Filter
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Industry (any of)">
                <Input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Finance, Consulting"
                />
              </Field>
              <Field label="Company (any of)">
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Goldman Sachs, JPMorgan"
                />
              </Field>
              <Field label="Team / Group (any of)">
                <Input
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  placeholder="TMT, Healthcare Coverage"
                />
              </Field>
              <Field label="School (any of)">
                <Input
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  placeholder="University of Chicago, Wharton"
                />
              </Field>
              <Field label="Tags (any of)">
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="recruiter, mentor"
                />
              </Field>
              <Field label="Days since last contact ≥">
                <Input
                  type="number"
                  value={daysSince}
                  onChange={(e) => setDaysSince(e.target.value)}
                  placeholder="30"
                />
              </Field>
              <Field label="Min keep-in-touch (0..1)">
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={minK2T}
                  onChange={(e) => setMinK2T(e.target.value)}
                  placeholder="0.5"
                />
              </Field>
              <Field label="Free-text search">
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="referrer notes, met_via, etc."
                />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={create} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
