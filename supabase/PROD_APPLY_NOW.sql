-- =============================================================
-- Orbit prod migration pack: 0012 + 0013 + 0014
-- =============================================================
-- Paste this whole file into the Supabase dashboard → SQL Editor → Run.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / ON CONFLICT).
-- After running, the new voice memo + AI summary + MCP server features
-- can read/write their columns without 42703 ("column does not exist") errors.
--
-- This file is a concatenation of:
--   supabase/migrations/0012_voice_memos.sql
--   supabase/migrations/0013_interaction_ai.sql
--   supabase/migrations/0014_mcp_oauth.sql
-- It does NOT update the _orbit_migrations tracking table; if/when you
-- run `npm run migrate` later, each file will be marked applied via
-- their own inserts. To keep state perfectly in sync, after running this
-- you can also run the three `insert into _orbit_migrations` lines at the
-- bottom (commented out for safety until you're sure).
-- =============================================================


-- ============== 0012_voice_memos.sql ==========================

alter table interactions
  add column if not exists audio_path text,            -- storage key: <user>/<contact>/<uuid>.webm
  add column if not exists audio_duration_ms integer,  -- length in ms, capped 30min server-side
  add column if not exists audio_mime text;            -- e.g. audio/webm;codecs=opus

-- The bucket. Created idempotently so re-running the migration is a no-op.
-- Public=false: every read goes through a signed URL minted server-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-memos',
  'voice-memos',
  false,
  26214400,  -- 25 MB
  array[
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/ogg',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ============== 0013_interaction_ai.sql =======================

alter table interactions
  add column if not exists ai_title text,
  add column if not exists ai_summary text,
  add column if not exists ai_action_items jsonb,
  add column if not exists ai_generated_at timestamptz;


-- ============== 0014_mcp_oauth.sql ============================

create table if not exists mcp_clients (
  id                 uuid        primary key default uuid_generate_v4(),
  clerk_user_id      text        not null references app_users(clerk_user_id) on delete cascade,
  client_id          text        not null unique,
  client_secret_hash text        not null,
  client_name        text        not null,
  redirect_uris      text[]      not null default '{}',
  scopes_granted     text[]      not null default '{}',
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz,
  revoked_at         timestamptz
);
create index if not exists mcp_clients_user_idx on mcp_clients (clerk_user_id);
alter table mcp_clients enable row level security;

create table if not exists mcp_tokens (
  id                       uuid        primary key default uuid_generate_v4(),
  client_id                text        not null references mcp_clients(client_id) on delete cascade,
  clerk_user_id            text        not null references app_users(clerk_user_id) on delete cascade,
  token_hash               text        not null unique,
  kind                     text        not null check (kind in ('access','refresh','pat')),
  scopes                   text[]      not null,
  expires_at               timestamptz,
  refresh_token_encrypted  text,
  created_at               timestamptz not null default now(),
  revoked_at               timestamptz
);
create index if not exists mcp_tokens_lookup_idx on mcp_tokens (token_hash) where revoked_at is null;
create index if not exists mcp_tokens_user_idx on mcp_tokens (clerk_user_id, kind);
alter table mcp_tokens enable row level security;

create table if not exists mcp_auth_codes (
  code            text        primary key,
  client_id       text        not null references mcp_clients(client_id) on delete cascade,
  clerk_user_id   text        not null references app_users(clerk_user_id) on delete cascade,
  redirect_uri    text        not null,
  scopes          text[]      not null,
  pkce_challenge  text        not null,
  expires_at      timestamptz not null,
  used_at         timestamptz
);
create index if not exists mcp_auth_codes_expiry_idx on mcp_auth_codes (expires_at);
alter table mcp_auth_codes enable row level security;

create table if not exists mcp_audit_log (
  id              uuid        primary key default uuid_generate_v4(),
  clerk_user_id   text        not null references app_users(clerk_user_id) on delete cascade,
  client_id       text,
  method          text        not null,
  name            text        not null,
  ok              boolean     not null,
  status_code     integer,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);
create index if not exists mcp_audit_log_user_idx on mcp_audit_log (clerk_user_id, created_at desc);
alter table mcp_audit_log enable row level security;


-- ============== Optional: mark them applied ===================
-- Uncomment ONLY after the ALTERs/CREATEs above succeeded. This keeps the
-- tracking table in sync so `npm run migrate` won't try to re-run them.
--
-- insert into _orbit_migrations (name) values
--   ('0012_voice_memos.sql'),
--   ('0013_interaction_ai.sql'),
--   ('0014_mcp_oauth.sql')
-- on conflict (name) do nothing;
