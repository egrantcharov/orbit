"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowRight,
  Loader2,
  ClipboardList,
  Sparkles,
  Compass,
  User,
  Newspaper,
  X,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SearchContact = {
  id: string;
  email: string | null;
  display_name: string | null;
  company: string | null;
  job_title: string | null;
};
type SearchArticle = {
  id: string;
  url: string;
  title: string | null;
  publication_name: string | null;
};
type SearchInteraction = {
  id: string;
  contact_id: string;
  kind: string;
  title: string | null;
  body: string | null;
  contact_name: string | null;
};

type Mode = "default" | "log" | "ask";

const PAGES: Array<{ key: string; label: string; href: string }> = [
  { key: "today", label: "Contacts (Today)", href: "/app" },
  { key: "network", label: "Network", href: "/app/network" },
  { key: "meetings", label: "Meetings", href: "/app/meetings" },
  { key: "reads", label: "Reads", href: "/app/reads" },
  { key: "synth", label: "Synth", href: "/app/synth" },
  { key: "import", label: "Import", href: "/app/import" },
  { key: "settings", label: "Settings", href: "/app/settings" },
];

export function QuickCapture() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("default");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<SearchContact[]>([]);
  const [articles, setArticles] = useState<SearchArticle[]>([]);
  const [interactions, setInteractions] = useState<SearchInteraction[]>([]);
  const [searching, setSearching] = useState(false);
  // log-note state
  const [logContact, setLogContact] = useState<SearchContact | null>(null);
  const [logBody, setLogBody] = useState("");
  const [logBusy, setLogBusy] = useState(false);
  // ask state
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askBusy, setAskBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setMode("default");
    setQuery("");
    setContacts([]);
    setArticles([]);
    setInteractions([]);
    setLogContact(null);
    setLogBody("");
    setAskAnswer(null);
  }, []);

  // Global ⌘K / Ctrl+K hotkey
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle =
        (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isToggle) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Search-as-you-type
  useEffect(() => {
    if (!open) return;
    if (mode === "ask") return; // ask mode handles its own input
    const q = query.trim();
    let cancelled = false;
    if (q.length < 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContacts([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArticles([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInteractions([]);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=8`,
        );
        if (!res.ok) return;
        const j = (await res.json()) as {
          contacts: SearchContact[];
          articles: SearchArticle[];
          interactions: SearchInteraction[];
        };
        if (cancelled) return;
        setContacts(j.contacts);
        setArticles(j.articles);
        setInteractions(j.interactions);
      } catch {
        /* ignore — surface only on user action */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, mode]);

  // Focus input when opened or mode changes
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, mode]);

  function pickContact(c: SearchContact) {
    if (mode === "log") {
      setLogContact(c);
      setQuery("");
      return;
    }
    router.push(`/app/contact/${c.id}`);
    close();
  }

  function pickArticle(a: SearchArticle) {
    if (a.url) window.open(a.url, "_blank");
    close();
  }

  function pickInteraction(i: SearchInteraction) {
    router.push(`/app/contact/${i.contact_id}`);
    close();
  }

  function pickPage(href: string) {
    router.push(href);
    close();
  }

  async function saveLog() {
    if (!logContact || !logBody.trim() || logBusy) return;
    setLogBusy(true);
    const t = toast.loading("Logging…");
    try {
      const res = await fetch(
        `/api/contacts/${logContact.id}/interactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "note", body: logBody }),
        },
      );
      if (!res.ok) throw new Error(`Log failed (${res.status})`);
      toast.success("Logged", { id: t });
      router.refresh();
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Log failed", { id: t });
    } finally {
      setLogBusy(false);
    }
  }

  async function ask() {
    const q = query.trim();
    if (!q || askBusy) return;
    setAskBusy(true);
    setAskAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Ask failed (${res.status})`);
      }
      const j = (await res.json()) as { answer?: string };
      setAskAnswer(j.answer ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setAskBusy(false);
    }
  }

  const matchingPages = PAGES.filter((p) =>
    p.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <DialogTitle className="sr-only">Quick capture</DialogTitle>
        <DialogDescription className="sr-only">
          Search contacts, articles, log notes, or ask Orbit.
        </DialogDescription>

        {/* Top: input + mode chips */}
        <div className="border-b">
          <div className="flex items-center gap-2 px-4 h-12">
            {mode === "ask" ? (
              <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
            ) : mode === "log" ? (
              <ClipboardList className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (mode === "ask" && e.key === "Enter") {
                  e.preventDefault();
                  void ask();
                }
              }}
              placeholder={
                mode === "ask"
                  ? "Ask Orbit anything about your network…"
                  : mode === "log" && !logContact
                    ? "Search a contact to log a note for…"
                    : mode === "log" && logContact
                      ? `Note for ${logContact.display_name ?? logContact.email}…`
                      : "Search contacts, articles, or pages — type ? to ask"
              }
              className="flex-1 h-full bg-transparent outline-none text-sm"
              disabled={mode === "log" && !!logContact}
            />
            {mode !== "default" && (
              <button
                type="button"
                onClick={() => {
                  setMode("default");
                  setLogContact(null);
                  setLogBody("");
                  setAskAnswer(null);
                  setQuery("");
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                back
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 font-mono">
              esc
            </kbd>
          </div>
        </div>

        {/* Mode-specific body */}
        <div className="max-h-[60vh] overflow-y-auto">
          {mode === "ask" ? (
            <AskBody answer={askAnswer} busy={askBusy} onAsk={() => void ask()} />
          ) : mode === "log" && logContact ? (
            <LogBody
              contact={logContact}
              body={logBody}
              busy={logBusy}
              onChange={setLogBody}
              onSave={() => void saveLog()}
            />
          ) : (
            <DefaultBody
              query={query}
              searching={searching}
              contacts={contacts}
              articles={articles}
              interactions={interactions}
              pages={matchingPages}
              onPickContact={pickContact}
              onPickArticle={pickArticle}
              onPickInteraction={pickInteraction}
              onPickPage={pickPage}
              onLogMode={() => {
                setMode("log");
                setQuery("");
              }}
              onAskMode={() => setMode("ask")}
              hasResults={
                contacts.length + articles.length + interactions.length > 0
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DefaultBody(props: {
  query: string;
  searching: boolean;
  contacts: SearchContact[];
  articles: SearchArticle[];
  interactions: SearchInteraction[];
  pages: Array<{ key: string; label: string; href: string }>;
  onPickContact: (c: SearchContact) => void;
  onPickArticle: (a: SearchArticle) => void;
  onPickInteraction: (i: SearchInteraction) => void;
  onPickPage: (href: string) => void;
  onLogMode: () => void;
  onAskMode: () => void;
  hasResults: boolean;
}) {
  const {
    query,
    searching,
    contacts,
    articles,
    interactions,
    pages,
    onPickContact,
    onPickArticle,
    onPickInteraction,
    onPickPage,
    onLogMode,
    onAskMode,
    hasResults,
  } = props;
  return (
    <div className="flex flex-col">
      {/* Quick actions row — always visible */}
      <Section label="Actions">
        <ActionRow
          icon={ClipboardList}
          label="Log a note for a contact"
          onClick={onLogMode}
        />
        <ActionRow
          icon={Sparkles}
          label="Ask Orbit"
          onClick={onAskMode}
          subtitle={
            query.length > 1 ? `Ask: "${query}"` : "Press to compose a question"
          }
        />
      </Section>

      {searching && (
        <div className="px-4 py-2 text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          searching…
        </div>
      )}

      {contacts.length > 0 && (
        <Section label="Contacts">
          {contacts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPickContact(c)}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-accent/50 transition-colors"
            >
              <ContactAvatar
                email={c.email ?? ""}
                displayName={c.display_name}
                size="sm"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">
                  {c.display_name ?? c.email}
                </span>
                {(c.job_title || c.company) && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {[c.job_title, c.company].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto" />
            </button>
          ))}
        </Section>
      )}

      {articles.length > 0 && (
        <Section label="Articles">
          {articles.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onPickArticle(a)}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-accent/50 transition-colors"
            >
              <Newspaper className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm truncate">
                  {a.title ?? "(untitled)"}
                </span>
                {a.publication_name && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {a.publication_name}
                  </span>
                )}
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto" />
            </button>
          ))}
        </Section>
      )}

      {interactions.length > 0 && (
        <Section label="Recent notes">
          {interactions.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => onPickInteraction(i)}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-accent/50 transition-colors"
            >
              <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col min-w-0">
                <span className="text-sm truncate">
                  {i.title ?? i.body?.slice(0, 80) ?? "(note)"}
                </span>
                {i.contact_name && (
                  <span className="text-[11px] text-muted-foreground truncate">
                    {i.contact_name}
                  </span>
                )}
              </div>
              <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto" />
            </button>
          ))}
        </Section>
      )}

      {pages.length > 0 && (
        <Section label="Jump to">
          {pages.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onPickPage(p.href)}
              className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-accent/50 transition-colors"
            >
              <Compass className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm">{p.label}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto" />
            </button>
          ))}
        </Section>
      )}

      {!searching && query.trim().length > 0 && !hasResults && pages.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          No matches. Try{" "}
          <button
            type="button"
            onClick={onAskMode}
            className="underline hover:text-foreground"
          >
            asking Orbit
          </button>{" "}
          instead.
        </div>
      )}
    </div>
  );
}

function LogBody({
  contact,
  body,
  busy,
  onChange,
  onSave,
}: {
  contact: SearchContact;
  body: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-md border bg-secondary/30 p-2">
        <ContactAvatar
          email={contact.email ?? ""}
          displayName={contact.display_name}
          size="sm"
        />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium truncate">
            {contact.display_name ?? contact.email}
          </span>
          {(contact.job_title || contact.company) && (
            <span className="text-[11px] text-muted-foreground truncate">
              {[contact.job_title, contact.company].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        <User className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
      </div>
      <textarea
        value={body}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
        rows={6}
        placeholder="What happened? Coffee chat, phone call, intro from Sarah, follow-up needed…"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
      />
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={busy || !body.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Save note
        </Button>
      </div>
    </div>
  );
}

function AskBody({
  answer,
  busy,
  onAsk,
}: {
  answer: string | null;
  busy: boolean;
  onAsk: () => void;
}) {
  return (
    <div className="p-4 flex flex-col gap-3">
      {!answer && !busy && (
        <p className="text-xs text-muted-foreground">
          Try: &quot;headhunters in my contacts&quot;, &quot;people whose
          birthday is next week&quot;, &quot;Goldman folks I haven&apos;t
          talked to in 60 days.&quot;
        </p>
      )}
      <Button onClick={onAsk} disabled={busy} variant="outline" size="sm" className="self-start">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        Ask
      </Button>
      {busy && (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          thinking…
        </div>
      )}
      {answer && (
        <div className="rounded-md border bg-secondary/30 p-3 text-sm whitespace-pre-wrap leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b last:border-b-0">
      <div
        className={cn(
          "px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/30",
        )}
      >
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  subtitle,
  onClick,
}: {
  icon: typeof Search;
  label: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-accent/50 transition-colors"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col min-w-0">
        <span className="text-sm">{label}</span>
        {subtitle && (
          <span className="text-[11px] text-muted-foreground truncate">
            {subtitle}
          </span>
        )}
      </div>
      <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto" />
    </button>
  );
}
