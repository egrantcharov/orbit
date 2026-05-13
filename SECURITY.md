# Orbit Security

Orbit handles personal-graph data: email metadata, calendar events, voice memos, manually logged conversations. This document captures the v3 (Week 8) threat model, the controls in place, and the known gaps.

## Threat model

| Threat                                     | Impact                                              | Likelihood        |
|--------------------------------------------|-----------------------------------------------------|-------------------|
| Stolen refresh token → silent Gmail read   | High (whole inbox metadata exfiltrated)             | Low (encrypted)   |
| Cross-tenant data leak (user A reads B's)  | Critical (privacy violation, breach reporting)      | Low (scoped writes, RLS) |
| Prompt injection via email content → Claude tool call | Medium (could leak data via Ask Orbit) | Medium |
| Voice-memo audio leaked from storage       | High (PII)                                          | Low (private bucket, signed URLs) |
| Abuse of AI endpoints → cost blowup        | Medium (financial)                                  | Medium (rate-limited) |
| Stored XSS via contact name / note         | Medium (account takeover)                           | Low (React escapes, no `dangerouslySetInnerHTML`) |
| Supply-chain compromise (npm package)      | Critical                                            | Low (Vercel build attestation) |

Out of scope: physical device theft, malware on the user's machine, browser compromise, social engineering of the user, attacks against Clerk/Supabase/Anthropic themselves.

## Secrets

| Secret                       | Location                  | Storage              | Rotation                                                            |
|-------------------------------|---------------------------|----------------------|---------------------------------------------------------------------|
| `CLERK_SECRET_KEY`            | Vercel env (prod/preview) | Vercel               | Rotate in Clerk dashboard → swap in Vercel.                         |
| `SUPABASE_SERVICE_ROLE_KEY`   | Vercel env                | Vercel               | Rotate in Supabase → swap in Vercel; old key invalidates instantly. |
| `GOOGLE_OAUTH_CLIENT_SECRET`  | Vercel env                | Vercel               | Rotate in GCP → swap in Vercel.                                     |
| `TOKEN_ENCRYPTION_KEY` (AES)  | Vercel env                | Vercel               | **Rotation requires re-encrypt migration** — see below.             |
| `ANTHROPIC_API_KEY`           | Vercel env                | Vercel               | Rotate via Anthropic dashboard → swap in Vercel.                    |
| OAuth refresh tokens          | `mailbox_connections`     | AES-256-GCM at rest  | User can disconnect Google to clear; rotates on Google's schedule.  |

**No secrets are committed to git.** `.env.local` is gitignored; `.env.local.example` only lists key names.

**Refresh-token encryption-key rotation:** decrypt-then-re-encrypt loop over the `mailbox_connections` table. Today this is a manual `npm run` script you'd have to write before rotating — tracked as a follow-up. Until then, treat the encryption key as long-lived and instead rotate the underlying Google refresh token (user disconnects + reconnects).

## Authentication & authorization

- **Session auth:** Clerk. All non-public routes go through `clerkMiddleware` in `src/proxy.ts`. The matcher excludes static assets but covers every `/app/*` and `/api/*` route.
- **Single public API surface:** `/api/google/callback`. It uses Clerk's `auth()` inside the handler and validates `state === userId` for CSRF protection (Clerk session is the only thing that determines who the state was minted for).
- **Server-side scoping:** every database read/write filters by `clerk_user_id`. The service-role Supabase client bypasses RLS, so the filter is the only thing keeping tenants apart — but RLS is enabled with no permissive policies as defense in depth (if the service-role client is ever swapped for the anon one, queries break loudly instead of leaking).
- **OAuth scopes:** Gmail metadata + Calendar read-only. We never request `gmail.modify` or `gmail.send` with full inbox access; sending uses `gmail.send` minimal scope.
- **No client-side DB writes.** The publishable Supabase key is unused in the browser; all mutations go through `/api/*` routes that re-check `auth()`.

## Inputs

Every mutation endpoint follows the same shape:

1. `auth()` → 401 if no session.
2. (UUID routes) `isUuid(id)` → 400 on bad path segment.
3. Per-user rate-limit check (token bucket in `src/lib/security/rateLimit.ts`).
4. JSON parse with explicit body-size cap via `readJsonBody()` in `src/lib/security/input.ts`.
5. Field-by-field type + length checks.
6. Ownership check (does `contact_id` belong to this user?) before any storage/AI side effect.

Caps in effect:

| Route                                   | Body cap | Rate limit              | Notes                                  |
|------------------------------------------|----------|--------------------------|----------------------------------------|
| `POST /api/ask`                          | 4 KB     | 20/min/user             | Claude tool loop ≤ 5 iterations.      |
| `POST /api/contacts/import`              | 4 MB     | 10/hour/user            | ≤ 5000 rows.                          |
| `POST /api/contacts/[id]/interactions`   | 64 KB    | 120/hour/user           | Body field ≤ 10k chars.               |
| `POST /api/contacts/[id]/voice`          | 20 MB    | 60/hour/user            | MIME allow-list, duration ≤ 30 min.   |
| `POST /api/bookmarks`                    | — (default)| n/a (low-fanout)      | URL normalized + Jina-fetched title.   |

**AI inputs:** every endpoint that hands user-controllable text to Claude (Ask, Synth, summaries, meeting briefs) caps the input length and runs inside server routes where the Anthropic key never reaches the browser. Tool-call loops are capped at 5 iterations.

**Prompt-injection mitigations:** the Ask Orbit tool set is read-only (`search_contacts`, `get_contact_details`, `stats`) — no tool can write to the database, send email, or call external URLs. Worst case for a malicious email body that ends up in the model's context is misinforming the user, not exfiltrating data.

## Storage

- **Voice memos** live in the private `voice-memos` Supabase Storage bucket. Bucket has a 25 MB file-size cap and a MIME allow-list at the platform level. Reads only happen through fresh 60-second signed URLs minted server-side (`/api/contacts/[id]/voice/[interactionId]`).
- **Keys are namespaced** `<userId>/<contactId>/<uuid>.<ext>` so disconnect+wipe is a single prefix delete (planned future endpoint).
- **No client-side uploads.** The browser hits our route handler, which then hits Supabase Storage — keeping the service-role key off the wire.

## Transport & headers

- HTTPS enforced via `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (see `next.config.ts`).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: microphone=(self)` — voice memos need the mic; geolocation and camera are denied entirely.

CSP is **deliberately not** in place yet. Clerk + Supabase realtime + Sonner together need a tuned `script-src` / `connect-src` / `style-src` policy; shipping a wrong CSP is worse than no CSP. Tracked as a Week-9 follow-up.

## Logging

- Server logs include `userId` and Supabase error `code` only — never refresh tokens, access tokens, OAuth codes, message bodies, or transcript text.
- `console.error` lines are reviewed periodically; if any new logger ships, it inherits this contract.

## Known gaps (Week-9 follow-ups)

1. **CSP** — see above.
2. **Token-encryption-key rotation script** — re-encrypt loop over `mailbox_connections`.
3. **CI gates** — eslint runs locally but isn't a required GitHub check; the Playwright suite isn't wired into CI yet.
4. **Vercel WAF rules** — for production, set up a managed ruleset + IP-based rate limit at the edge (the in-process limiter is per-instance only).
5. **Supply-chain pinning** — npm dependencies aren't currently pinned via `package-lock.json` integrity attestation in CI.
6. **PII deletion endpoint** — "delete everything Orbit knows about me" walks `app_users`, `contacts`, `interactions`, `briefings`, voice-memo storage. Currently you can disconnect Google but the contacts and history persist.

## Reporting

Found something? Email emil.a.grantcharov+orbit-security@gmail.com. Don't file public issues for vulnerabilities.
