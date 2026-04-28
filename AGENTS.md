<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Orbit

Personal CRM + reading-digest AI. Auto-ingests Gmail and Calendar to build relationship timelines per contact, ships a daily briefing of who-to-reach-out-to (with messages drafted in your voice) and what-to-read.

This is the **v1 (Week 6)** slice. AI features and the reading list arrive in v2–v4.

## Architecture

- **Framework:** Next.js 16 (App Router, TypeScript, Tailwind v4)
- **Auth:** Clerk (`src/proxy.ts` gates `/app/*` and `/api/*`)
- **DB:** Supabase Postgres, accessed only via the **service role** from server code. No anon-key usage in v1, no client-side DB calls. RLS is enabled on every table with no permissive policies — defense in depth in case the anon key is ever used by mistake.
- **Google OAuth:** A separate, server-side flow at `/api/google/connect` and `/api/google/callback`. Refresh tokens are AES-256-GCM encrypted at rest (`src/lib/crypto.ts`). This is decoupled from Clerk because Clerk's session token doesn't carry Gmail/Calendar API scopes.
- **Gmail sync:** `src/lib/gmail/sync.ts` pulls last 30 days of message metadata (sender / recipients / subject / date — never bodies in v1, scope is `gmail.metadata`), de-dupes contacts and threads, and bulk-upserts.

## Routes

| Path                       | Purpose                                          |
|----------------------------|--------------------------------------------------|
| `/`                        | Public landing                                   |
| `/sign-in`, `/sign-up`     | Clerk hosted UI                                  |
| `/app`                     | Authed home: contact list, sync controls         |
| `/app/contact/[id]`        | Per-contact detail: recent threads               |
| `/api/google/connect`      | Initiates Google OAuth                           |
| `/api/google/callback`     | Token exchange, encrypted persist, redirect home |
| `/api/sync`                | POST: pulls last 30d of Gmail and upserts        |

## Data model (`supabase/migrations/0001_init.sql`)

- `app_users` — keyed by Clerk `userId`
- `google_connections` — one row per user; encrypted refresh token + scopes + last sync time
- `contacts` — unique on `(clerk_user_id, email)`
- `threads` — unique on `(clerk_user_id, gmail_thread_id)`
- `thread_participants` — `(thread_id, contact_id, role)` where role ∈ {from, to, cc}

## Environment

See `.env.local.example`. All secrets server-side except the Clerk publishable key, Supabase URL/publishable key, and the app URL.

`TOKEN_ENCRYPTION_KEY` must be a 32-byte hex string. Generate with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Conventions

- All DB access goes through `createSupabaseServiceClient()` in `src/lib/supabase/service.ts`. Always filter by `clerk_user_id`.
- Never log refresh tokens, access tokens, or full email bodies.
- Server Components are the default; only mark a file `"use client"` when it actually needs interactivity.
- Tailwind utilities only. No shadcn/ui in v1 (planned for v2 polish).

## What's deferred (v2 → v4)

- Claude API integration: AI-summarized relationship context per contact, drafted outreach messages in user's voice, voice-memo transcription summaries.
- Reading list ingestion (Jina Reader) and morning digest curation.
- Calendar event ingestion (scope already enabled on the consent screen — need to add `events.list` calls).
- Network graph visualization, vector closeness scoring, article↔person cross-pollination.
- Email delivery via Resend.
- Background sync via cron (currently manual button).
