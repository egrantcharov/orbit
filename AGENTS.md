<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Orbit

Personal CRM + reading-digest AI. Auto-ingests Gmail and Calendar to build relationship timelines per contact, then quietly nudges you toward who-to-reach-out-to (with messages drafted in your voice) and what-to-read.

This is the **v1 (Week 6)** slice. AI features and the reading list arrive in v2–v4.

## Architecture

- **Framework:** Next.js 16 (App Router, TypeScript, Tailwind v4, Turbopack)
- **Auth:** Clerk via `src/proxy.ts` (Next 16 renamed `middleware` → `proxy`). Protects `/app/*` and `/api/*` except `/api/google/callback`.
- **DB:** Supabase Postgres. v1 uses the **service role only** from server code — no anon-key usage, no client-side DB calls. RLS is enabled on every table with no permissive policies, so the anon key cannot read or write anything (defense in depth).
- **Google OAuth:** Independent, server-side flow at `/api/google/connect` → `/api/google/callback`. Refresh tokens are AES-256-GCM encrypted at rest via `src/lib/crypto.ts`. Decoupled from Clerk because Clerk session tokens don't carry Gmail/Calendar API scopes.
- **Gmail sync:** `src/lib/gmail/sync.ts` pulls the last 30 days of message metadata (sender / recipients / subject / date — never bodies in v1, scope is `gmail.metadata`) in parallel batches of 25, then bulk-upserts contacts, threads, and `thread_participants` (with the per-thread role each contact had).
- **UI:** Hand-rolled shadcn-style component library in `src/components/ui/` over Radix UI + class-variance-authority. Theme tokens live in `src/app/globals.css` as HSL CSS variables, surfaced through `@theme inline`. Dark mode follows system `prefers-color-scheme`.

## Routes

| Path                          | Purpose                                                   |
|-------------------------------|-----------------------------------------------------------|
| `/`                           | Public landing (auth-aware CTA)                           |
| `/sign-in`, `/sign-up`        | Clerk hosted UI in branded shell                          |
| `/app`                        | Authed home: stats bar, search, sort, contact list        |
| `/app/contact/[id]`           | Per-contact: header, role distribution, recent threads    |
| `/api/google/connect`         | Initiates Google OAuth (offline + force consent)          |
| `/api/google/callback`        | Token exchange, encrypted persist, redirect to /app       |
| `/api/google/disconnect`      | POST: removes the Google connection (keeps contacts)      |
| `/api/sync`                   | POST: rate-limited (30s) pull of last 30d of Gmail        |

`src/app/app/{layout,loading,error,not-found}.tsx` provide the shell, skeleton, error boundary, and 404 for the authed area.

## Components

- `src/components/ui/*` — Button, Card, Avatar, Input, Skeleton, Badge, Separator, DropdownMenu, Tooltip, ContactAvatar, Sonner toaster.
- `src/components/brand/logo.tsx` — wordmark + lucide Orbit icon.
- `src/components/app/AppHeader.tsx` — sticky header.
  - `SyncControl` — sync chip (fresh/stale/very_stale/never) + button with toast feedback.
  - `UserMenu` — avatar dropdown with Disconnect Google + Sign out.
- `src/components/app/StatsBar.tsx` — 4-up summary cards.
- `src/components/app/ContactList.tsx` — client-filtered/sortable list.
- `src/components/app/EmptyState.tsx` — Connect Google + No contacts states.

## Data model (`supabase/migrations/0001_init.sql`)

- `app_users` — keyed by Clerk `userId`.
- `google_connections` — one row per user; encrypted refresh token + scopes + `last_sync_at`.
- `contacts` — unique on `(clerk_user_id, email)`; aggregated `message_count` and `last_interaction_at`.
- `threads` — unique on `(clerk_user_id, gmail_thread_id)`; subject, snippet, last_message_at.
- `thread_participants` — `(thread_id, contact_id, role)` where role ∈ {from, to, cc}; participants per thread are de-duped and the first-observed role wins per (thread, contact).

## Environment

See `.env.local.example`. All secrets stay server-side except the Clerk publishable key, Supabase URL + publishable key, and the app URL.

`TOKEN_ENCRYPTION_KEY` must be a 32-byte hex string:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Conventions

- All DB access goes through `createSupabaseServiceClient()` (`src/lib/supabase/service.ts`). Always filter by `clerk_user_id`.
- Never log refresh tokens, access tokens, OAuth codes, or message bodies. `console.error` may include `userId` and Supabase error codes only.
- Server Components are the default; flag `"use client"` only where interactivity is real (forms, dropdowns, fetch handlers, toasts).
- Use `cn()` from `src/lib/utils.ts` to merge classNames; use `avatarColorClass()` for deterministic per-contact colors.
- Use Sonner (`toast.loading/success/error`) for transient feedback, not inline status text.
- Sticky-header backdrop blur uses `supports-[backdrop-filter]:bg-background/60` so older browsers fall back to opaque.

## Security audit (v1)

- OAuth callback validates `state === userId` (Clerk session-bound CSRF check).
- `prompt=consent&access_type=offline` forces a refresh token on every connect.
- Refresh-token encryption uses AES-256-GCM with a 12-byte IV and authenticated tag (`src/lib/crypto.ts`).
- `/api/sync` is rate-limited to one call per 30s per user (returns 429 + `Retry-After`).
- `googleapis` `oauth2.on('tokens')` re-encrypts and persists rotated refresh tokens.
- The proxy matcher excludes static assets and only passes app + API traffic through Clerk.

## What's deferred (v2 → v4)

- Claude API integration: AI-summarized relationship context per contact, drafted outreach messages in user's voice, voice-memo transcription summaries.
- Reading list ingestion (Jina Reader) and morning digest curation.
- Calendar event ingestion (scope already enabled on the consent screen — need to add `events.list` calls).
- Network graph visualization, vector closeness scoring, article↔person cross-pollination.
- Email delivery via Resend.
- Background sync via cron (currently manual button).
