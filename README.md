# Orbit

A personal operating system for your relationships and knowledge. Orbit auto-ingests Gmail and Calendar to build a relationship timeline for everyone you know, then quietly nudges you toward the right next conversation and the right next thing to read — without asking you to remember to do the work.

Built for [Design, Build, Ship (MPCS 51238)](https://mpcs-courses.cs.uchicago.edu/) at UChicago.

## v1 status (Week 6)

The current build proves the core ingest loop end-to-end:

- Sign in with Clerk
- Connect a Google account (separate OAuth flow scoped to Gmail metadata + Calendar read)
- Pull the last 30 days of Gmail metadata
- See an auto-built contact list ordered by recency, with per-contact detail pages

AI summaries, reading list, morning briefing, and voice-memo ingestion arrive in v2–v4. See `AGENTS.md` for architecture details and the project proposal in the class repo for the full roadmap.

## Setup

```bash
npm install
cp .env.local.example .env.local
# fill in keys, then:
npm run dev
```

You'll need:

1. **Clerk** account → create app, paste publishable + secret keys.
2. **Supabase** project → run `supabase/migrations/*.sql` against your DB (e.g. via the SQL editor), paste URL + publishable + service-role keys.
3. **Google Cloud** project → enable Gmail API + Calendar API, create OAuth 2.0 client (Web), set redirect URI to `http://localhost:3000/api/google/callback`, configure consent screen as External / Testing, paste client ID + secret.
4. A 32-byte hex token-encryption key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Clerk · Supabase · `googleapis` · Vercel

## License

MIT
