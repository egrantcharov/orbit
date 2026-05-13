# Orbit

A personal operating system for your relationships and knowledge. Orbit auto-ingests Gmail and your calendar, augments it with your LinkedIn export, and composes real tools — daily nudges, meeting prep, voice memos, cross-source synthesis — into one calm surface.

Built for [Design, Build, Ship (MPCS 51238)](https://mpcs-courses.cs.uchicago.edu/) at UChicago.

**Live:** https://orbit-drab-phi.vercel.app — **Current build:** v3.13 (Week 8)

---

## What's actually here

**v1 → v2 → v3** spans the project arc. The v3 branch (v3.1 → v3.9) is the active daily-driver:

| Surface           | What it does                                                                                  |
|-------------------|-----------------------------------------------------------------------------------------------|
| **Today**         | A daily card list — drifting contacts, upcoming meetings, birthdays, scheduled follow-ups.    |
| **⌘K Quick Capture** | One keystroke from anywhere to log against the right contact.                              |
| **Voice memos**   | Record audio in the browser, Claude turns the transcript into a title + summary + action items, all attached to the contact card. |
| **Conversation history** | Unified, paginated, searchable feed of email threads + interactions + voice memos, with filter chips (Email / Calls / Voice / Notes). |
| **Synth**         | Two-pass cross-source synthesis of newsletters + RSS into themed cards with citations.        |
| **Auto-enrich**   | Drop a CSV; Claude batches 30 contacts/call with prompt caching, fires-and-forgets.           |
| **Smart Lists**   | Saved filter sets with optional pipeline stages.                                              |
| **Network view**  | Industry → company → person pivot across your contacts.                                       |
| **Reads**         | RSS + TLDR feeds, bulk paste import, Jina-fetched titles.                                     |
| **Meeting briefs**| Per-event one-pager: last conversation + recent threads → talking points.                     |
| **Ask Orbit**     | Natural-language search with Claude tool calls (search_contacts, get_contact_details, stats). |

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · Clerk · Supabase (service-role server-side only, RLS on every table) · `googleapis` · Anthropic Claude Sonnet 4.6 · Playwright · Vercel

## Architecture in one screen

- **Auth:** Clerk via `src/proxy.ts` (Next 16 renamed `middleware` → `proxy`). Protects `/app/*` and `/api/*` except `/api/google/callback`.
- **DB:** Supabase Postgres, service role only from server code. RLS enabled everywhere with no permissive policies (defense in depth).
- **Mailbox layer:** Provider-agnostic adapter in `src/lib/mailbox/` — Gmail today, Outlook is one file away.
- **OAuth:** Independent server-side flow at `/api/google/connect` → `/api/google/callback`. Refresh tokens AES-256-GCM encrypted at rest via `src/lib/crypto.ts`.
- **Migrations:** Hand-rolled runner with its own tracking table (`_orbit_migrations`); run with `npm run migrate`.
- **AI cache:** `briefings` table is a generic cache, multiple `kind` values (today, meeting, synth_daily, synth_weekly) share one TTL pattern.
- **AI calls:** Server-only via `@anthropic-ai/sdk`. Sonnet 4.6 with prompt caching on rubric/system blocks. Tool loops capped at 5 iterations.
- **Storage:** Voice memo audio in a private Supabase Storage bucket; transcripts in `interactions.body`.

See [AGENTS.md](./AGENTS.md) for the deeper architectural notes and [SECURITY.md](./SECURITY.md) for the v3 threat model.

## Setup

```bash
npm install
cp .env.local.example .env.local
# fill in keys, then:
npm run migrate     # apply pending Supabase migrations
npm run dev
```

You'll need:

1. **Clerk** account → create app, paste publishable + secret keys.
2. **Supabase** project → either run `npm run migrate` (preferred, tracks state in `_orbit_migrations`) or paste `supabase/migrations/*.sql` into the SQL editor.
3. **Google Cloud** project → enable Gmail API + Calendar API, create OAuth 2.0 client (Web), set redirect URI to `http://localhost:3000/api/google/callback`, configure consent screen as External / Testing, paste client ID + secret.
4. A 32-byte hex token-encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. **Anthropic API key** for the AI features (Today, Synth, summaries, meeting briefs, Ask Orbit, voice transcription).

## Scripts

```bash
npm run dev          # next dev (Turbopack)
npm run build        # next build
npm run lint         # eslint
npm run migrate      # apply pending supabase migrations
npm run migrate:dry  # show which migrations would run
npm run seed:pubs    # seed the 15-publication RSS starter pack
npm run test:e2e     # Playwright smoke tests (Today, Synth, CSV import)
```

## Testing

Playwright smoke tests covering the highest-value surfaces (landing render, auth gates, Synth, CSV import):

```bash
npx playwright install --with-deps   # first time only
npm run test:e2e                     # runs against local `npm run dev`
```

To smoke against the live production URL after a deploy (no dev server needed):

```bash
PLAYWRIGHT_BASE_URL=https://orbit-drab-phi.vercel.app npm run test:e2e
```

The CI workflow (`.github/workflows/ci.yml`) gates only lint + tsc — the e2e suite needs a real Clerk publishable key on dev-server startup, so it lives in the local + post-deploy paths instead.

## Security

- Service-role Supabase access is server-only. The publishable key is never used client-side for DB writes.
- Refresh tokens are AES-256-GCM encrypted with a 12-byte IV and authenticated tag.
- All `/api/*` routes (except `/api/google/callback`) are gated by Clerk and scoped by `clerk_user_id` server-side.
- OAuth callback validates `state === userId` for CSRF.
- Mutation endpoints have per-route size + content caps; AI endpoints have iteration caps; voice uploads are size-, MIME-, and duration-capped.
- See [SECURITY.md](./SECURITY.md) for the full threat model and v3 audit notes.

## License

MIT
