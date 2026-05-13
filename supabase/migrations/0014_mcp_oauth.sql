-- Orbit v3.14: MCP (Model Context Protocol) server tables.
--
-- Four tables back the OAuth 2.1 Dynamic Client Registration flow + the
-- bearer-token auth on the MCP route:
--
--   - mcp_clients      registered OAuth clients (Claude Desktop, Cursor, …)
--   - mcp_tokens       access + refresh tokens (sha256 hashed; refresh
--                      bodies are AES-256-GCM via src/lib/crypto.ts)
--   - mcp_auth_codes   short-lived PKCE auth codes from the authorize step
--   - mcp_audit_log    one row per MCP tool/prompt/resource call
--
-- Every table is scoped by clerk_user_id and has RLS enabled. Service-role
-- access (the only access used by Orbit's server code) bypasses RLS by
-- design; the policies stay enabled as defense-in-depth — if anyone ever
-- swaps in the anon key, queries break loudly instead of leaking.

-- 1) mcp_clients ---------------------------------------------------------
create table if not exists mcp_clients (
  id                 uuid        primary key default uuid_generate_v4(),
  clerk_user_id      text        not null references app_users(clerk_user_id) on delete cascade,
  client_id          text        not null unique,
  client_secret_hash text        not null,          -- sha256(secret); secret returned to caller once
  client_name        text        not null,
  redirect_uris      text[]      not null default '{}',
  scopes_granted     text[]      not null default '{}',
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz,
  revoked_at         timestamptz
);
create index if not exists mcp_clients_user_idx on mcp_clients (clerk_user_id);
alter table mcp_clients enable row level security;

-- 2) mcp_tokens ----------------------------------------------------------
create table if not exists mcp_tokens (
  id                       uuid        primary key default uuid_generate_v4(),
  client_id                text        not null references mcp_clients(client_id) on delete cascade,
  clerk_user_id            text        not null references app_users(clerk_user_id) on delete cascade,
  token_hash               text        not null unique,  -- sha256 of the bearer string
  kind                     text        not null check (kind in ('access','refresh','pat')),
  scopes                   text[]      not null,
  expires_at               timestamptz,
  refresh_token_encrypted  text,                          -- only set when kind='refresh'; AES-256-GCM
  created_at               timestamptz not null default now(),
  revoked_at               timestamptz
);
create index if not exists mcp_tokens_lookup_idx on mcp_tokens (token_hash) where revoked_at is null;
create index if not exists mcp_tokens_user_idx on mcp_tokens (clerk_user_id, kind);
alter table mcp_tokens enable row level security;

-- 3) mcp_auth_codes (PKCE auth-code grant intermediate) ------------------
create table if not exists mcp_auth_codes (
  code            text        primary key,
  client_id       text        not null references mcp_clients(client_id) on delete cascade,
  clerk_user_id   text        not null references app_users(clerk_user_id) on delete cascade,
  redirect_uri    text        not null,
  scopes          text[]      not null,
  pkce_challenge  text        not null,  -- S256
  expires_at      timestamptz not null,
  used_at         timestamptz
);
create index if not exists mcp_auth_codes_expiry_idx on mcp_auth_codes (expires_at);
alter table mcp_auth_codes enable row level security;

-- 4) mcp_audit_log -------------------------------------------------------
create table if not exists mcp_audit_log (
  id              uuid        primary key default uuid_generate_v4(),
  clerk_user_id   text        not null references app_users(clerk_user_id) on delete cascade,
  client_id       text,                              -- nullable for direct PAT calls
  method          text        not null,              -- 'tools/call', 'prompts/get', 'resources/read'
  name            text        not null,              -- e.g. 'search_contacts'
  ok              boolean     not null,
  status_code     integer,                           -- mirrors HTTP-style status for tool result
  duration_ms     integer,
  created_at      timestamptz not null default now()
);
create index if not exists mcp_audit_log_user_idx on mcp_audit_log (clerk_user_id, created_at desc);
alter table mcp_audit_log enable row level security;
