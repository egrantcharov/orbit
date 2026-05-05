"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Newspaper,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Check,
  ExternalLink,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Publication = {
  id: string;
  name: string;
  feed_url: string;
  site_url: string | null;
  description: string | null;
  last_polled_at: string | null;
  poll_error: string | null;
  created_at: string;
};

type Article = {
  id: string;
  publication_id: string;
  url: string;
  title: string | null;
  author: string | null;
  snippet: string | null;
  published_at: string | null;
  fetched_at: string;
  is_read: boolean;
  is_starred: boolean;
  tldr: string | null;
  tldr_takeaways: string[] | null;
  tldr_at: string | null;
};

type Filter = "all" | "unread" | "starred";

const FILTERS: Filter[] = ["all", "unread", "starred"];

function relTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return new Date(iso).toLocaleDateString();
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export default function ReadsPage() {
  const [pubs, setPubs] = useState<Publication[] | null>(null);
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [activePub, setActivePub] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tldrBusy, setTldrBusy] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setBusy(true);
    try {
      const [pubsRes, artsRes] = await Promise.all([
        fetch("/api/publications"),
        fetch(
          `/api/articles?filter=${filter}${activePub ? `&pub=${activePub}` : ""}`,
        ),
      ]);
      if (pubsRes.ok) {
        const j = (await pubsRes.json()) as { publications: Publication[] };
        setPubs(j.publications);
      }
      if (artsRes.ok) {
        const j = (await artsRes.json()) as { articles: Article[] };
        setArticles(j.articles);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reads load failed");
    } finally {
      setBusy(false);
    }
  }, [filter, activePub]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll();
  }, [loadAll]);

  async function refreshAll() {
    setRefreshing(true);
    const t = toast.loading("Refreshing all feeds…");
    try {
      const res = await fetch("/api/publications/refresh-all", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      const j = (await res.json()) as {
        polled?: number;
        inserted?: number;
        errors?: number;
      };
      toast.success(
        `Polled ${j.polled ?? 0} feeds · ${j.inserted ?? 0} new${j.errors ? ` · ${j.errors} errors` : ""}`,
        { id: t },
      );
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed", { id: t });
    } finally {
      setRefreshing(false);
    }
  }

  async function tldr(article: Article) {
    if (tldrBusy) return;
    setTldrBusy(article.id);
    const t = toast.loading("Generating TL;DR…");
    try {
      const res = await fetch(`/api/articles/${article.id}/tldr`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(j.message ?? `TLDR failed (${res.status})`);
      }
      toast.success("TL;DR ready", { id: t });
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "TLDR failed", { id: t });
    } finally {
      setTldrBusy(null);
    }
  }

  async function toggle(article: Article, field: "is_read" | "is_starred") {
    const next = !article[field];
    setArticles((cur) =>
      cur ? cur.map((a) => (a.id === article.id ? { ...a, [field]: next } : a)) : cur,
    );
    try {
      const res = await fetch(`/api/articles/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
    } catch (err) {
      // rollback
      setArticles((cur) =>
        cur
          ? cur.map((a) => (a.id === article.id ? { ...a, [field]: !next } : a))
          : cur,
      );
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-6xl w-full mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight inline-flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-muted-foreground" />
            Reads
          </h1>
          <p className="text-sm text-muted-foreground">
            Your reading queue. Subscribe to anything with an RSS feed —
            Substacks, blogs, Atom-publishing news sites. Click TL;DR for an
            AI summary.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh feeds
          </Button>
          <AddPublicationDialog onAdded={() => void loadAll()} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Left: publications */}
        <Card className="p-4 flex flex-col gap-3 h-fit lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Subscriptions</h2>
            <span className="text-xs text-muted-foreground">
              {pubs?.length ?? 0}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            <li>
              <button
                type="button"
                onClick={() => setActivePub(null)}
                className={cn(
                  "w-full text-left rounded-md px-2 py-1.5 text-sm transition-colors",
                  activePub === null
                    ? "bg-secondary text-foreground"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground",
                )}
              >
                All publications
              </button>
            </li>
            {(pubs ?? []).map((p) => (
              <li
                key={p.id}
                className="group flex items-center gap-1.5 rounded-md hover:bg-accent transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setActivePub(p.id)}
                  className={cn(
                    "flex-1 text-left rounded-md px-2 py-1.5 text-sm transition-colors min-w-0",
                    activePub === p.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  title={p.poll_error ?? p.feed_url}
                >
                  <span className="truncate block">{p.name}</span>
                  {p.poll_error && (
                    <span className="text-[10px] text-rose-600">poll err</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Remove "${p.name}"?`)) return;
                    const res = await fetch(`/api/publications/${p.id}`, {
                      method: "DELETE",
                    });
                    if (res.ok) {
                      toast.success("Removed");
                      void loadAll();
                    } else {
                      toast.error("Remove failed");
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 px-1.5 text-muted-foreground hover:text-rose-500"
                  aria-label="Remove publication"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          {(pubs?.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground">
              No subscriptions yet. Click + to add a publication.
            </p>
          )}
        </Card>

        {/* Right: articles */}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors capitalize",
                  filter === f
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">
              {articles ? `${articles.length} item${articles.length === 1 ? "" : "s"}` : ""}
            </span>
          </div>

          {articles === null ? (
            <Card className="p-12 grid place-items-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </Card>
          ) : articles.length === 0 ? (
            <Card className="p-12 text-center flex flex-col items-center gap-3">
              <Newspaper className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {(pubs?.length ?? 0) === 0
                  ? "Add a publication to start the queue."
                  : filter === "unread"
                    ? "All caught up."
                    : "No articles yet — try Refresh feeds."}
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {articles.map((a) => {
                const pub = (pubs ?? []).find((p) => p.id === a.publication_id);
                return (
                  <li key={a.id}>
                    <ArticleCard
                      article={a}
                      pubName={pub?.name ?? null}
                      tldrBusy={tldrBusy === a.id}
                      onToggleRead={() => void toggle(a, "is_read")}
                      onToggleStar={() => void toggle(a, "is_starred")}
                      onTldr={() => void tldr(a)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {busy && (
        <div className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-background border px-3 py-1.5 text-xs text-muted-foreground shadow">
          <Loader2 className="h-3 w-3 animate-spin" /> loading…
        </div>
      )}
    </main>
  );
}

function ArticleCard({
  article,
  pubName,
  tldrBusy,
  onToggleRead,
  onToggleStar,
  onTldr,
}: {
  article: Article;
  pubName: string | null;
  tldrBusy: boolean;
  onToggleRead: () => void;
  onToggleStar: () => void;
  onTldr: () => void;
}) {
  return (
    <Card
      className={cn(
        "p-4 flex flex-col gap-3 transition-opacity",
        article.is_read && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {pubName && (
              <Badge variant="muted" className="font-normal">
                {pubName}
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground">
              {relTime(article.published_at ?? article.fetched_at)}
            </span>
            {article.author && (
              <span className="text-[11px] text-muted-foreground">
                · {article.author}
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold leading-snug mt-1">
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {article.title ?? article.url}
            </a>
          </h3>
          {article.snippet && !article.tldr && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {article.snippet}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onToggleStar}
            title={article.is_starred ? "Unstar" : "Star"}
            className={cn(
              "p-1.5 rounded-md hover:bg-accent transition-colors",
              article.is_starred ? "text-amber-500" : "text-muted-foreground",
            )}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                article.is_starred && "fill-current",
              )}
            />
          </button>
          <button
            type="button"
            onClick={onToggleRead}
            title={article.is_read ? "Mark unread" : "Mark read"}
            className={cn(
              "p-1.5 rounded-md hover:bg-accent transition-colors",
              article.is_read ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {article.is_read ? <Check className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 opacity-30" />}
          </button>
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Open original"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {article.tldr ? (
        <div className="rounded-lg border bg-secondary/30 p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              TL;DR
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {article.tldr_at && `${relTime(article.tldr_at)} ago`}
            </span>
          </div>
          <p className="text-sm leading-relaxed">{article.tldr}</p>
          {article.tldr_takeaways && article.tldr_takeaways.length > 0 && (
            <ul className="flex flex-col gap-1 pl-4 list-disc text-xs leading-relaxed">
              {article.tldr_takeaways.map((tk, i) => (
                <li key={i}>{tk}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={onTldr}
          disabled={tldrBusy}
          className="self-start"
        >
          {tldrBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          TL;DR
        </Button>
      )}
    </Card>
  );
}

function AddPublicationDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (busy) return;
    if (!url.trim()) {
      toast.error("URL required");
      return;
    }
    setBusy(true);
    const t = toast.loading("Adding publication…");
    try {
      const res = await fetch("/api/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (j.error === "no_feed_found") {
          throw new Error(
            j.message ?? "Couldn't find an RSS feed at that URL.",
          );
        }
        throw new Error(`Add failed (${res.status})`);
      }
      toast.success("Added", { id: t });
      setUrl("");
      setOpen(false);
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed", { id: t });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add publication
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subscribe to a publication</DialogTitle>
          <DialogDescription>
            Paste a homepage URL (we&apos;ll auto-find the RSS feed) or a
            direct feed URL. Substacks, Ghost blogs, Medium publications,
            news sites — anything with RSS or Atom works.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://stratechery.com or https://example.com/feed.xml"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
          <p className="text-xs text-muted-foreground">
            Examples: stratechery.com, pragmaticengineer.com,{" "}
            <span className="font-mono">substack.com/@author/feed</span>
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button variant="ghost">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={add} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Subscribe
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
