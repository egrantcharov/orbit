"use client";

/**
 * Paginated, searchable history feed for a single contact. Merges threads
 * and interactions server-side — see /api/contacts/[id]/history. Designed to
 * scroll calmly: 25 items per page, "Load older" reveals the next slice.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mail,
  CalendarClock,
  Mic,
  Phone,
  MessageSquare,
  ClipboardList,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Users2,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { VoiceMemoPlayer } from "@/components/app/VoiceMemoPlayer";

type Role = "from" | "to" | "cc";

type EmailItem = {
  kind: "email_thread";
  id: string;
  occurredAt: string;
  subject: string | null;
  preview: string | null;
  role: Role | null;
};

type LogItem = {
  kind:
    | "calendar_event"
    | "note"
    | "voice_memo"
    | "phone"
    | "imessage";
  id: string;
  occurredAt: string;
  title: string | null;
  body: string | null;
  aiTitle: string | null;
  aiSummary: string | null;
  aiActionItems: string[];
  audio: { path: string; durationMs: number | null; mime: string | null } | null;
};

type Item = EmailItem | LogItem;

type Response = {
  ok: true;
  items: Item[];
  nextBefore: string | null;
  hasMore: boolean;
};

const ROLE_META: Record<Role, { label: string; Icon: typeof Mail }> = {
  from: { label: "They wrote", Icon: ArrowDownLeft },
  to: { label: "You wrote", Icon: ArrowUpRight },
  cc: { label: "CC'd", Icon: Users2 },
};

const KIND_META = {
  email_thread: {
    label: "Email",
    Icon: Mail,
    tone: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  calendar_event: {
    label: "Meeting",
    Icon: CalendarClock,
    tone: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  },
  note: {
    label: "Note",
    Icon: ClipboardList,
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  voice_memo: {
    label: "Voice",
    Icon: Mic,
    tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  phone: {
    label: "Phone",
    Icon: Phone,
    tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  },
  imessage: {
    label: "Chat",
    Icon: MessageSquare,
    tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
} as const;

type Filter = "all" | "email" | "calls" | "voice" | "notes";

const FILTERS: Array<{ key: Filter; label: string; matches: (it: Item) => boolean }> = [
  { key: "all", label: "All", matches: () => true },
  { key: "email", label: "Email", matches: (it) => it.kind === "email_thread" },
  {
    key: "calls",
    label: "Calls",
    matches: (it) => it.kind === "phone" || it.kind === "calendar_event",
  },
  { key: "voice", label: "Voice", matches: (it) => it.kind === "voice_memo" },
  {
    key: "notes",
    label: "Notes",
    matches: (it) => it.kind === "note" || it.kind === "imessage",
  },
];

export function ConversationHistory({ contactId }: { contactId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (opts: { before?: string | null; q?: string; append?: boolean }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (opts.before) params.set("before", opts.before);
        if (opts.q) params.set("q", opts.q);
        const res = await fetch(
          `/api/contacts/${contactId}/history${params.toString() ? `?${params}` : ""}`,
        );
        if (!res.ok) throw new Error(`History load failed (${res.status})`);
        const j = (await res.json()) as Response;
        setItems((prev) => (opts.append ? [...prev, ...j.items] : j.items));
        setHasMore(j.hasMore);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "History load failed");
      } finally {
        setLoading(false);
      }
    },
    [contactId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load({});
  }, [load]);

  function onSearchChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setActiveQuery(value);
      void load({ q: value || undefined });
    }, 250);
  }

  const activeMatcher =
    FILTERS.find((f) => f.key === filter)?.matches ?? FILTERS[0].matches;
  const visible = items.filter(activeMatcher);
  const filterCounts = FILTERS.map((f) => ({
    ...f,
    count: items.filter(f.matches).length,
  }));
  const last = items[items.length - 1];
  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Conversation history
          </h2>
          <p className="text-xs text-muted-foreground">
            Every email, meeting, note, and voice memo with this contact.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {items.length} loaded
          {hasMore ? " · more available" : ""}
        </span>
      </div>

      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search this contact's history…"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filterCounts.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground border-border"
              }`}
            >
              {f.label}
              {f.key !== "all" && f.count > 0 && (
                <span
                  className={`ml-1 ${active ? "text-background/70" : "text-muted-foreground/60"}`}
                >
                  {f.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {items.length === 0 && loading ? (
        <ul className="flex flex-col gap-3" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-md bg-foreground/10 animate-pulse shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="h-3 w-48 rounded bg-foreground/15 animate-pulse" />
                <div className="h-2.5 rounded bg-foreground/10 animate-pulse" />
                <div className="h-2.5 w-[78%] rounded bg-foreground/10 animate-pulse" />
              </div>
            </li>
          ))}
        </ul>
      ) : visible.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {activeQuery
            ? "Nothing matched that search."
            : filter !== "all"
              ? `No ${filter} entries loaded yet.`
              : "No history yet. Log a note, record a call, or sync Gmail to populate this feed."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((it) => (
            <HistoryRow key={`${it.kind}:${it.id}`} item={it} contactId={contactId} />
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="pt-1 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() =>
              load({
                before: last?.occurredAt ?? undefined,
                q: activeQuery || undefined,
                append: true,
              })
            }
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            Load older
          </Button>
        </div>
      )}
    </Card>
  );
}

function HistoryRow({ item, contactId }: { item: Item; contactId: string }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.Icon;
  if (item.kind === "email_thread") {
    const RoleIcon = item.role ? ROLE_META[item.role].Icon : null;
    return (
      <li className="flex items-start gap-3">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.tone}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <h4 className="text-sm font-medium truncate">
                {item.subject ?? "(no subject)"}
              </h4>
              <Badge variant="muted" className="font-normal text-[10px]">
                {meta.label}
              </Badge>
              {item.role && RoleIcon && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <RoleIcon className="h-2.5 w-2.5" />
                  {ROLE_META[item.role].label}
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {formatRelativeTime(item.occurredAt)}
            </span>
          </div>
          {item.preview && (
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed mt-1">
              {item.preview}
            </p>
          )}
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.tone}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="text-sm font-medium truncate">
              {item.title || item.aiTitle || meta.label}
            </h4>
            <Badge variant="muted" className="font-normal text-[10px]">
              {meta.label}
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {formatRelativeTime(item.occurredAt)}
          </span>
        </div>
        {item.aiSummary ? (
          <p className="text-sm text-foreground/90 leading-relaxed mt-1">
            {item.aiSummary}
          </p>
        ) : (
          item.body && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed mt-1">
              {item.body}
            </p>
          )
        )}
        {item.aiActionItems.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {item.aiActionItems.map((a, i) => (
              <li
                key={i}
                className="text-xs text-muted-foreground flex items-start gap-1.5"
              >
                <span className="text-foreground/70">→</span>
                {a}
              </li>
            ))}
          </ul>
        )}
        {item.kind === "voice_memo" && item.audio && (
          <VoiceMemoPlayer
            contactId={contactId}
            interactionId={item.id}
            durationMs={item.audio.durationMs}
            mime={item.audio.mime}
          />
        )}
      </div>
    </li>
  );
}

