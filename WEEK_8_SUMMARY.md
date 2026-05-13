# Week 8 — Project v3 Summary

**Live:** https://orbit-drab-phi.vercel.app
**Repo:** https://github.com/egrantcharov/orbit
**Current build:** v3.13

This is the model-generated summary the v3 rubric asks for — what was built this week, why, and how the work lands against the assignment goal ("iterate + audit v2 with security in mind: address secrets, auth, and inputs").

## What shipped this week

### Voice memos on every contact card
- New `VoiceRecorderModal` uses `MediaRecorder` for actual audio plus the browser's `SpeechRecognition` in parallel for a live transcript. The audio file lands in a **private** Supabase Storage bucket; the transcript becomes the body of a `kind=voice_memo` row in the `interactions` table.
- After the upload, a Claude (Sonnet 4.6) post-processor turns the messy transcript into a clean title, a 2–3 sentence summary, and up to four imperative action items. Runs through Next.js `after()` so the user sees the save immediately and the AI fields arrive on the next refresh.
- Playback is gated by 60-second signed URLs minted server-side — the bucket is never publicly readable.
- New migration `0012_voice_memos.sql` adds `audio_path / audio_duration_ms / audio_mime` to `interactions` and provisions the bucket with a 25 MB / MIME allow-list at the platform level. `0013_interaction_ai.sql` adds the AI columns.

### Conversation history per contact
- Unified, paginated, searchable feed at `/api/contacts/[id]/history` that merges email threads + interactions + voice memos in chronological order, with cursor pagination.
- New `ConversationHistory` client component with debounced server-side search and filter chips (All / Email / Calls / Voice / Notes) for the most common cuts.
- Replaces the static "Recent threads" section on the contact-detail page.

### Today section gets agentic
- New `voice_followup` card kind surfaces the Claude-extracted action items from the last 7 days of voice memos — the things the user literally promised on the call get rendered as bullets on the Today card. Ranked just after upcoming meetings.
- Loading skeletons replace the spinner-text on Today + Conversation History so first paint feels designed.

### Keyboard shortcuts on the contact page
- `r` → Record call, `e` → Email, `c` → Schedule, `l` → Log interaction.
- Implemented as a `ContactShortcuts` client component that locates triggers via a documented `data-shortcut` attribute contract — no state lifting across the modals.

### Data export + delete-my-data
- `GET /api/me/export` dumps every row Orbit holds about the user as one JSON file (voice audio referenced by storage key, not inlined).
- `POST /api/me/delete` cascades through every table tied to the user's `clerk_user_id` and bulk-removes the user's storage prefix. Requires `{ "confirm": "DELETE" }` in the body so a fat-fingered fetch can't nuke the account.
- New `DataControls` component on `/app/settings` wires both into the UI.

### Security pass (the assignment goal)
- New `src/lib/security/input.ts` — shared `readJsonBody()` with body-size caps, `isUuid()` for path-segment validation, `rateLimitResponse()` helper.
- New `src/lib/security/rateLimit.ts` — in-process token-bucket limiter keyed by `<route>:<userId>`. Documented as defense-in-depth only (per-instance leaky under Fluid Compute); real abuse defense is deferred to the Vercel WAF (tracked in `SECURITY.md`).
- Per-route caps wired into `/api/ask`, `/api/contacts/import`, `/api/contacts/[id]/interactions`, `/api/contacts/[id]/voice`, `/api/me/export`, `/api/me/delete`.
- Platform headers in `next.config.ts`: `Strict-Transport-Security` with preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), geolocation=(), microphone=(self)`.
- `SECURITY.md` documents the v3 threat model, secrets inventory + rotation, auth model, per-route caps table, storage notes, and Week-9 follow-ups (CSP, key rotation script, Vercel WAF, supply-chain pinning, PII deletion — the last of which got shipped this week).
- New `/api/health` endpoint: auth-gated DB reachability probe that returns the actual Supabase error code + message, so "import failed: db_error" becomes "Supabase project looks paused" or "service-role key looks wrong" in one round trip.

### CI gate
- New `.github/workflows/ci.yml` runs `lint` + `tsc --noEmit` on every push and PR. Playwright suite stays in the local + post-deploy paths (boots the dev server which needs a real Clerk key on bind — synthetic keys break Clerk's middleware).

### Playwright smoke tests
- 10 tests across `landing`, `auth-gates`, `csv-import`, `synth`. All 10 pass. New `npm run test:e2e` script + the `PLAYWRIGHT_BASE_URL` env var to run against the live production URL after a deploy.

### Footer + README freshness (professor's bug)
- `src/lib/version.ts` is now the single source of truth for the visible version chip. Surfaces in the landing-page footer and the in-app UserMenu.
- README rewritten to drop the "v1 status (Week 6)" stub and the planned-not-shipped roadmap. Now mirrors what's actually in the deployed build.
- Landing page features grid surfaces what shipped: Today, ⌘K, voice memos, Synth, Auto-enrich, Network, Smart Lists, meeting briefs, Ask Orbit.

### Landing-page hero
- New inline SVG `HeroMock` above the feature grid — shows the voice-recording flow, AI summary, action items, filter chips. No asset pipeline, brand-color-aware.

## Architecture moves that survive into v4

- **Provider-agnostic mailbox adapter** carried forward from v3.x: Gmail + Outlook drop in as one file each.
- **Generic `briefings` cache table** picked up two new kinds this week (`synth_daily`, `synth_weekly` from prior weeks; voice-memo-driven today cards reuse the same TTL pattern via the `today` row).
- **`interactions` as the unified activity log** absorbed voice memos cleanly — same row, four new columns. Conversation History merges threads + interactions over a single chronological cursor.
- **AI post-processing via `after()`** is the template for future AI surfaces (meeting summaries, contact deep-dives) — the user pays no latency cost and Vercel keeps the function alive until the deferred task resolves.

## How the assignment goal landed

The v3 assignment was *"audit v2 with security in mind: secrets, auth, inputs."* Concretely:

- **Secrets**: every secret stays server-side. Refresh tokens AES-256-GCM encrypted at rest with a 12-byte IV + auth tag. Vercel envs inventoried in `SECURITY.md` with rotation notes. The `pk_test_dummy` failure on the first CI run actually validated this — Clerk refused a fake publishable key, exactly the design intent.
- **Auth**: Clerk gates every `/app/*` and `/api/*` route except `/api/google/callback`. OAuth `state === userId` for CSRF. Every API handler re-checks `auth()` and scopes queries by `clerk_user_id` — even though service-role bypasses RLS, RLS is enabled with no permissive policies as defense-in-depth.
- **Inputs**: shared `readJsonBody` size-caps every mutation endpoint. UUID path-segment validation prevents log-injection. `isPlainObject` guards JSON shape before field-by-field type checks. AI endpoints have iteration caps (≤ 5 tool-call loops on Ask). Voice uploads are size + MIME + duration capped at three layers (browser cap, server cap, bucket-level platform cap).

## Commit count for v3

10 numbered feature releases (`feat(v3)` → `feat(v3.12)`) plus 3 fix/chore commits (CI tightening, import diagnostic, migration bundle) = **13 commits** across the v3 series. All on `main`. CI green.

## Known gaps (Week-9 follow-ups)

Tracked in `SECURITY.md` and the closed-out task list:

- CSP — Clerk + Supabase + Sonner need a tuned `script-src`/`connect-src` policy. Shipping a wrong CSP is worse than no CSP.
- Token-encryption-key rotation script — currently rotate-by-disconnect-reconnect.
- Vercel WAF rules — edge-level rate limit + bot management.
- Supply-chain pinning in CI (npm integrity attestation).

Vendor-side: the database password drift after Supabase auto-pause + restore (which surfaced as today's CSV-import outage) is now diagnosable in ~5 seconds via `/api/health` instead of the previous generic `db_error 500`.
