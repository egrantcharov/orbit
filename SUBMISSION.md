# Orbit — Project v3 Submission

> **Copy the block below into Google Classroom.** Everything the rubric asks for is in there. The longer model-generated summary lives below the block — link or paste, your call.

---

## Paste this into Classroom

```
Repo: https://github.com/egrantcharov/orbit
Live: https://orbit-drab-phi.vercel.app
Build: v3.14 (Week 8 — 14 commits across the v3 series, all on main)
Model-generated summary: https://github.com/egrantcharov/orbit/blob/main/SUBMISSION.md#model-generated-summary

What's new this week (v3.9 → v3.14, security pass + new surfaces):

1. Voice memos on every contact card. MediaRecorder + browser
   SpeechRecognition in parallel, audio in a private Supabase Storage
   bucket, transcript + AI-cleaned title + summary + action items via
   Claude Sonnet 4.6 (deferred via Next.js after() so the save is
   instant). Plays back via 60-second signed URLs minted server-side.

2. Conversation history per contact — unified paginated + searchable
   feed (Email / Calls / Voice / Notes filter chips) merging threads,
   interactions, and voice memos.

3. Today section gets agentic — voice-memo action items roll up into a
   "follow up from your call with X" card, ranked just after upcoming
   meetings.

4. Keyboard shortcuts on the contact page (r/e/c/l).

5. Data export + erase-my-data endpoints on /app/settings ("right to
   access" + "right to erasure" — closes one Week-9 SECURITY.md gap).

6. MCP server. Orbit now exposes itself as a Model Context Protocol
   server at /api/mcp so Claude Desktop, Cursor, the Anthropic API, or
   any MCP-aware client can use Orbit as a tool surface. Full OAuth 2.1
   + Dynamic Client Registration + PKCE S256, scoped tokens, per-tool
   scope checks, audit log, revocation UI at /app/settings/mcp.
   6 tools shipped: search_contacts, get_contact_details,
   get_contact_stats, get_today_cards, list_interactions,
   get_action_items, log_interaction.

Security pass (the assignment's stated goal — "audit v2 with security
in mind: secrets, auth, inputs"):

- New SECURITY.md with the v3 threat model + per-route caps table +
  Week-9 follow-ups.
- Shared input-validation lib (src/lib/security/input.ts): readJsonBody
  with body-size caps, isUuid path validation, rateLimitResponse.
- Token-bucket rate limiter (src/lib/security/rateLimit.ts) on every
  mutation endpoint: /api/ask (20/min), /api/contacts/import (10/hr),
  /api/contacts/[id]/interactions (120/hr), /api/contacts/[id]/voice
  (60/hr), /api/me/export (3/5min), /api/me/delete (2/hr), /api/mcp
  (600/min global).
- Platform security headers via next.config.ts: HSTS w/ preload,
  X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy
  strict-origin-when-cross-origin, Permissions-Policy microphone=(self)
  + camera=() + geolocation=().
- OAuth refresh tokens (Google + MCP) AES-256-GCM encrypted at rest
  via the existing src/lib/crypto.ts helper.
- All bearer tokens stored as sha256(token); no usable secret recoverable
  from a DB leak.
- CI gate: .github/workflows/ci.yml runs lint + tsc on every push.
- 10 Playwright smoke tests across landing / auth gates / Synth /
  CSV import (all passing).
- /api/health endpoint surfaces real Supabase error codes (no more
  generic db_error 500).

Commits in this week's series (P3, all on main):
- feat(v3.9):  voice memos + conversation history + security pass + e2e
- feat(v3.10): voice-memo AI summary + history filters + CI gate
- feat(v3.11): data export + delete + landing hero + voice prominence
- feat(v3.12): keyboard shortcuts + voice follow-up cards + skeletons
- feat(v3.13): week-8 finalization + WEEK_8_SUMMARY.md
- feat(v3.14): MCP server (OAuth 2.1 + 6 tools)
+ 3 fix/chore commits (CI tightening, import diagnostic, migration bundle)

How to inspect:

- Landing: https://orbit-drab-phi.vercel.app
- Health probe (sign in, then open):
  https://orbit-drab-phi.vercel.app/api/health
- MCP discovery (public, no auth needed):
  https://orbit-drab-phi.vercel.app/.well-known/oauth-authorization-server
- MCP settings UI: /app/settings/mcp
- Settings → Your data section for export / erase.
- Any contact card → red "Record call" button (or press R).

Repo notes:
- WEEK_8_SUMMARY.md = the long-form model-generated summary the rubric
  asks for.
- SECURITY.md = v3 threat model + per-route caps + Week-9 follow-ups.
- SUBMISSION.md (this file) = the copy-paste submission block.
- supabase/PROD_APPLY_NOW.sql = the three schema migrations
  (voice memos / AI summary / MCP OAuth) ready to paste into the
  Supabase dashboard SQL editor in one shot.
```

---

## Model-generated summary

(Detailed write-up the rubric asks for. Either link to this section
from Classroom, or paste the relevant parts inline above.)

### What I built this week (v3.9 → v3.14)

The assignment was "iterate on v2 with security in mind: address secrets, auth, inputs." I did the security pass and used the same week to add four new surfaces (voice memos, conversation history, data export/delete, and a remote MCP server) because each one was a natural place to exercise the security primitives I was building — body-size caps, scoped tokens, audit logging.

**Voice memos.** Hit Record on any contact card, talk for thirty seconds, get the audio attached + Claude-generated title + 2-3 sentence summary + a short imperative action-item list, all stitched into the contact's activity timeline. The browser captures audio via `MediaRecorder` and runs `SpeechRecognition` in parallel for a live transcript. The audio uploads to a private Supabase Storage bucket (25 MB / MIME-allow-list at the platform level, signed URLs minted per playback). The AI post-process runs via Next.js `after()` — the user sees the save instantly, the AI fields appear on the next page refresh.

**Conversation history.** Unified paginated + searchable feed at `/api/contacts/[id]/history` that merges email threads, interactions, and voice memos in chronological order. Filter chips (All / Email / Calls / Voice / Notes) make a busy contact card collapse to one signal class. Server-side debounced search with cursor pagination.

**Today section.** A new `voice_followup` card kind surfaces the Claude-extracted action items from the last 7 days of voice memos — the things the user literally promised on the call get rendered as bullets on the Today card, ranked just after upcoming meetings.

**Keyboard shortcuts.** `r` → Record call, `e` → Email, `c` → Schedule, `l` → Log interaction on the contact page. Implemented via a `ContactShortcuts` client component that locates triggers via a `data-shortcut` attribute contract — no state lifting required across the modals.

**Data export + erase.** `/api/me/export` dumps every row Orbit holds about the user as one JSON file. `/api/me/delete` cascades through every table tied to the user's `clerk_user_id` and bulk-removes the voice-memo storage prefix; requires `{ confirm: "DELETE" }` to prevent fat-finger fetches. UI lives in `/app/settings`.

**MCP server.** The biggest piece. Orbit now exposes itself as a Model Context Protocol server so Claude Desktop, Cursor, the Anthropic API, or any MCP-aware client can use Orbit as a first-class tool surface. The auth stack is standards-compliant: OAuth 2.1 with Dynamic Client Registration (RFC 7591), PKCE S256, discovery doc at `/.well-known/oauth-authorization-server`, three OAuth endpoints (`register`, `authorize`, `token`) plus an in-app consent screen at `/app/settings/mcp/consent`, plus revocation (RFC 7009). Access tokens are 1 hour, refresh tokens 30 days. All tokens stored as `sha256(token)`; refresh tokens additionally AES-256-GCM encrypted via the same `src/lib/crypto.ts` helper that protects Google OAuth refresh tokens. Eight scopes (`contacts:read/write`, `interactions:read/write`, `voice:read/write`, `briefings:read`, `ai:invoke`, `*`); every tool handler re-checks via `requireScope()` — the discovery list is never trusted alone. Six P0 tools shipped, audit log on every call, revocation UI lists active clients + recent activity.

### Security pass (the assignment's stated goal)

- **`SECURITY.md`** documents the v3 threat model (8 threats × impact × likelihood), the secrets inventory + rotation steps, the auth model, the per-route caps table, storage notes, the MCP section, and Week-9 follow-ups (CSP, key-rotation script, Vercel WAF, supply-chain pinning).
- **Shared input-validation library** (`src/lib/security/input.ts`): `readJsonBody` with body-size caps, `isUuid` for path-segment validation, `rateLimitResponse` helper.
- **Token-bucket rate limiter** (`src/lib/security/rateLimit.ts`) keyed by `<route>:<userId>`. Wired into every mutation endpoint with route-specific limits (Ask 20/min, import 10/hr, interactions 120/hr, voice 60/hr, MCP 600/min global, etc.).
- **Platform security headers** via `next.config.ts`: HSTS w/ preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: microphone=(self)` + camera and geolocation denied.
- **All bearer tokens** (Google OAuth refresh, MCP access + refresh + PAT) stored as `sha256(token)` only; refresh tokens additionally AES-256-GCM encrypted at rest.
- **CI gate** (`.github/workflows/ci.yml`) runs lint + tsc on every push/PR — green.
- **10 Playwright smoke tests** across landing / auth gates / Synth / CSV import — all passing locally + against the prod URL via `PLAYWRIGHT_BASE_URL`.
- **`/api/health`** auth-gated probe surfaces real Supabase error codes so a paused project / missing column / wrong key shows up immediately instead of as a generic `db_error 500` (saved us during the Week-8 prod outage, when free-tier Supabase auto-paused after 7 days of inactivity).

### Architecture notes that survive into v4

- **Provider-agnostic mailbox adapter** (Gmail today, Outlook is one file).
- **Generic `briefings` cache table** with multiple `kind` values sharing one TTL pattern.
- **`interactions` as the unified activity log** absorbed voice memos cleanly — same row, four new columns. Conversation History merges threads + interactions over a single chronological cursor.
- **AI post-processing via `after()`** is now the template for future AI surfaces (the voice flow paved the way; meeting summaries and contact deep-dives will reuse it).
- **MCP tool runtime reuses the Ask Orbit query builder** — `runTool()` is exported from `src/lib/anthropic/ask.ts` and called by the MCP `search_contacts` handler, so the LLM-internal tools and the MCP-exposed tools share one implementation.

### Optional walkthrough

If a grader wants to poke around without setting up a client:

1. **Landing page** — visit https://orbit-drab-phi.vercel.app, scroll past the hero mock to the feature grid. Confirm the footer says `v3.14` (the bug the professor flagged in Week 7 was a stale `v1` here).
2. **Sign in** with Google → land on `/app`.
3. **Today section** at the top of `/app` — daily nudges with voice-memo follow-ups when there's data.
4. **Open any contact** → click the red "Record call" button (or press `R`) → record 20 seconds → Save. Refresh the page and the activity log row gets the AI title + summary + action items.
5. **Conversation history** below the activity log — paginated + searchable + filter chips.
6. **Settings → MCP server** at `/app/settings/mcp` — copy the URL, paste into Claude Desktop's `claude_desktop_config.json`, and the OAuth handshake walks through automatically.
7. **Health probe** at `/api/health` (while signed in) — confirms DB connectivity, migration state, env vars.

### Commit log (P3, all on `main`)

```
04346ce feat(v3.14): MCP server — OAuth 2.1 + 6 tools for external Claude clients
ff0d3b9 feat(v3.13): week-8 final — model-generated summary, version bump
e16ff31 chore(migrations): bundle 0012 + 0013 for one-paste prod application
056e5be fix(import): surface real Supabase error + add /api/health probe
8044297 fix(ci): drop e2e step — Clerk middleware rejects synthetic pk on boot
3667a61 feat(v3.12): keyboard shortcuts, voice follow-up cards, skeleton polish
039a395 feat(v3.11): data export + delete, landing hero mock, voice prominence
9549b7d feat(v3.10): voice-memo AI summary, history filters, CI gate
68a3f75 feat(v3.9):  voice memos, conversation history, security pass, e2e tests
8fd7551 feat(v3.8):  daily-driver bundle — Synth, ⌘K, Auto-enrich, Smart Lists  (carried in from earlier)
```

**14 commits total in the v3 series**, including 3 fix/chore commits that landed alongside the numbered releases.

### Known gaps (Week-9)

Tracked in `SECURITY.md`:

1. CSP — Clerk + Supabase + Sonner need a tuned policy.
2. Token-encryption-key rotation script — currently rotate-by-disconnect.
3. Vercel WAF rules — edge-level rate limit + bot management.
4. Supply-chain pinning in CI (npm integrity attestation).
5. MCP server P1 (remaining 6 tools, 5 prompts, 4 resources) + P2 (Realtime subscriptions) — the architecture is in; the surface area expands next week.
