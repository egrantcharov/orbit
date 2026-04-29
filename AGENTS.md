<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Orbit

Personal CRM + reading-digest AI. Auto-ingests Gmail to build a relationship timeline for every contact, classifies the noise out of the way, and ships a smart layer on top: filters, suggestions, AI relationship summaries, a weekly newsletter digest, a bookmarks library, and natural-language search.

Currently at **v2** (deployed at https://orbit-drab-phi.vercel.app). v1 was the bare ingest loop; v2 layered the smart features over it.

## Architecture

- **Framework:** Next.js 16 (App Router, TypeScript, Tailwind v4, Turbopack)
- **Auth:** Clerk via `src/proxy.ts` (Next 16 renamed `middleware` → `proxy`). Protects `/app/*` and `/api/*` except `/api/google/callback`.
- **DB:** Supabase Postgres, **service role only** from server code — no anon-key usage, no client-side DB calls. RLS is enabled on every table with no permissive policies (defense in depth).
- **Google OAuth:** Independent, server-side flow at `/api/google/connect` → `/api/google/callback`. Refresh tokens are AES-256-GCM encrypted at rest via `src/lib/crypto.ts`. Decoupled from Clerk because Clerk session tokens don't carry Gmail/Calendar API scopes.
- **Gmail sync:** `src/lib/gmail/sync.ts` pulls the newest 500 messages, fetches metadata-only headers (From/To/Cc/Subject/Date) in parallel batches of 25, filters to the last 30 days client-side (the `gmail.metadata` scope rejects `q`), then bulk-upserts contacts, threads, and `thread_participants`.
- **Classification (hybrid):** `src/lib/classify/heuristics.ts` is a pure function that catches ~85% of contacts at sync time (noreply / marketing / single-msg-no-name / known transactional ESP domains). Anything left as `kind='unknown'` is batched (50/call) through Sonnet 4.6 via `/api/classify`, which fires automatically after every sync. Heuristic results are preserved on re-sync; user overrides flip `kind_locked=true` so neither pipeline reclassifies them again.
- **Anthropic:** Server-only via `@anthropic-ai/sdk` in `src/lib/anthropic/`. New `ANTHROPIC_API_KEY` env var. Sonnet 4.6 with prompt caching on rubric/system blocks. Tool-call loops capped at 5 iterations.
- **UI:** Hand-rolled shadcn-style component library in `src/components/ui/` over Radix UI + class-variance-authority. Theme tokens live in `src/app/globals.css` as HSL CSS variables, surfaced through `@theme inline`. Dark mode follows system `prefers-color-scheme`.

## Routes

| Path                                | Purpose                                                              |
|-------------------------------------|----------------------------------------------------------------------|
| `/`                                 | Public landing                                                       |
| `/sign-in`, `/sign-up`              | Clerk hosted UI in branded shell                                     |
| `/app`                              | Authed home: Ask Orbit, suggestions, stats, contacts (people / newsletters / all / pinned tabs, search, sort, filter chips) |
| `/app/contact/[id]`                 | Per-contact: header, AI summary card, role distribution, recent threads |
| `/app/library`                      | Bookmarks page (paste URL → Jina-fetched title + auto-classified kind) |
| `/app/digest`                       | AI-clustered weekly newsletter digest                                |
| `/api/google/connect`               | Initiates Google OAuth (offline + force consent + select_account)    |
| `/api/google/callback`              | Token exchange, encrypted persist, redirect to /app                  |
| `/api/google/disconnect`            | POST: removes Google connection (keeps contacts)                     |
| `/api/sync`                         | POST: rate-limited (30s) Gmail sync                                  |
| `/api/classify`                     | POST: Claude classifies kind='unknown' contacts in batches           |
| `/api/contacts/[id]`                | PATCH: kind / is_pinned overrides (kind sets kind_locked=true)       |
| `/api/contacts/[id]/summary`        | POST: Claude generates the relationship summary                      |
| `/api/bookmarks`                    | GET (list) · POST (create with Jina title fetch) · DELETE (?id=…)    |
| `/api/digest/weekly`                | POST: Claude weekly newsletter digest, cached 1 hour                 |
| `/api/ask`                          | POST: Ask Orbit — Claude with tool calls (search_contacts, get_contact_details, stats) |

`src/app/app/{layout,loading,error,not-found}.tsx` provide shell, skeleton, error boundary, and 404.

## Components

- `src/components/ui/*` — Button, Card, Avatar, Input, Skeleton, Badge, Separator, DropdownMenu, Tooltip, ContactAvatar, Sonner toaster.
- `src/components/brand/logo.tsx` — wordmark + lucide Orbit icon.
- `src/components/app/AppHeader.tsx` — sticky header.
  - `SyncControl` — sync chip + button; toasts; auto-fires /api/classify after sync.
  - `UserMenu` — avatar dropdown with Disconnect Google + Sign out.
  - `AppNav` — Contacts / Library / Digest tabs (active-route aware).
- `src/components/app/Suggestions.tsx` — server component: drifting people, pinned & quiet, new this week.
- `src/components/app/AskOrbit.tsx` — natural-language search input + answer card.
- `src/components/app/ContactTabs.tsx` — People / Newsletters / All / Pinned with counts.
- `src/components/app/ContactList.tsx` — client-filtered/sortable list with hover-revealed Pin + Classify menu.
- `src/components/app/PinButton.tsx`, `ClassifyMenu.tsx` — optimistic mutations with toast feedback.
- `src/components/app/SummaryCard.tsx` — generate / refresh AI relationship summary.
- `src/components/app/digest/DigestPanel.tsx` — generate / refresh weekly digest.
- `src/components/app/library/{BookmarkForm,BookmarkRow,LibraryFilter}.tsx` — bookmarks UI.

## Data model

`supabase/migrations/`:

- `0001_init.sql` — `app_users`, `google_connections`, `contacts`, `threads`, `thread_participants`.
- `0002_rls.sql` — RLS enabled on every table, no permissive policies.
- `0003_classify_pin.sql` — `contacts.kind` (with check constraint), `kind_reason`, `kind_locked`, `is_pinned`, `ai_summary`, `ai_summary_at`. Indexes for `(clerk_user_id, kind, last_interaction_at)` and partial `(clerk_user_id) where is_pinned`.
- `0004_bookmarks_digests.sql` — `bookmarks` (unique per user+url, kind constraint) and `digests` (week_start primary key per user).

Key invariants:
- `kind_locked=true` rows survive both sync and the LLM classifier; only the `/api/contacts/[id]` PATCH endpoint changes their `kind`.
- Sync re-derives the heuristic kind for unlocked rows; if the heuristic abstains and an existing kind isn't `unknown`, the prior LLM classification is preserved.
- `bookmarks` has a single-source-of-truth title field auto-fetched from Jina Reader; user can edit later (UI for that is v3).

## Environment

See `.env.local.example`. All secrets stay server-side except the Clerk publishable key, Supabase URL + publishable key, and the app URL.

`TOKEN_ENCRYPTION_KEY` must be a 32-byte hex string:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`ANTHROPIC_API_KEY` is required for the v2 AI features (classifier, summary, digest, ask). Without it, sync still works but the AI surfaces fail at runtime.

## Conventions

- All DB access goes through `createSupabaseServiceClient()` (`src/lib/supabase/service.ts`). Always filter by `clerk_user_id`.
- Never log refresh tokens, access tokens, OAuth codes, or message bodies. `console.error` may include `userId` and Supabase error codes only.
- Server Components are the default; flag `"use client"` only where interactivity is real.
- Use `cn()` from `src/lib/utils.ts` to merge classNames; `avatarColorClass()` for deterministic per-contact colors.
- Use Sonner (`toast.loading/success/error`) for transient feedback.
- All Anthropic calls happen behind server routes — never expose the key to the browser. Default model is `claude-sonnet-4-6` for cost; reach for `claude-opus-4-7` only when quality demands it.
- React 19's `react-hooks/purity` rule false-flags `Date.now()` in server components and inline component bodies. Hoist time-of-check helpers to module-scope functions; the rule traces only direct calls in component bodies.

## Security audit (v1 + v2)

- OAuth callback validates `state === userId` (Clerk session-bound CSRF check).
- `prompt=select_account+consent&access_type=offline` forces account picker + refresh token on every connect.
- Refresh-token encryption uses AES-256-GCM with a 12-byte IV and authenticated tag (`src/lib/crypto.ts`); rotated tokens re-encrypted via `oauth2.on('tokens')`.
- `/api/sync` rate-limited to one call per 30s per user (returns `429 + Retry-After`).
- `/api/classify` capped at 200 contacts per call, batched 50/request.
- `/api/ask` capped at 5 tool-call iterations and 1000-char input.
- All PATCH/POST endpoints under `/api/*` are gated by Clerk and scoped by `clerk_user_id` server-side.
- The proxy matcher excludes static assets and only passes app + API traffic through Clerk.

## What's deferred (v3+)

- Voice memo upload + Whisper transcription summaries.
- Drafted-message-in-your-voice (compose tab on contact detail).
- Calendar event ingestion (scope already enabled — need `events.list`).
- Network graph visualization, vector closeness scoring.
- Article→person cross-pollination ("send this saved bookmark to Sarah").
- Email delivery of the weekly digest (currently in-app only).
- Background sync via cron (currently manual button).
- Bookmark editing / tag autocomplete.
- "Ask Orbit" streaming + persisted history.
