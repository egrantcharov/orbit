-- Orbit v1 schema
-- All access goes through the service role from server-side code.
-- RLS enabled below as defense-in-depth; no permissive policies are added,
-- so the anon key cannot read or write anything.

create extension if not exists "uuid-ossp";

create table if not exists app_users (
  clerk_user_id text primary key,
  email         text,
  created_at    timestamptz not null default now()
);

create table if not exists google_connections (
  clerk_user_id            text        primary key references app_users(clerk_user_id) on delete cascade,
  google_email             text        not null,
  refresh_token_encrypted  text        not null,
  access_token             text,
  access_token_expires_at  timestamptz,
  scopes                   text[]      not null default '{}',
  last_sync_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table if not exists contacts (
  id                  uuid        primary key default uuid_generate_v4(),
  clerk_user_id       text        not null references app_users(clerk_user_id) on delete cascade,
  email               text        not null,
  display_name        text,
  last_interaction_at timestamptz,
  message_count       integer     not null default 0,
  created_at          timestamptz not null default now(),
  unique (clerk_user_id, email)
);
create index if not exists contacts_user_last_interaction_idx
  on contacts (clerk_user_id, last_interaction_at desc nulls last);

create table if not exists threads (
  id               uuid        primary key default uuid_generate_v4(),
  clerk_user_id    text        not null references app_users(clerk_user_id) on delete cascade,
  gmail_thread_id  text        not null,
  subject          text,
  snippet          text,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (clerk_user_id, gmail_thread_id)
);
create index if not exists threads_user_last_msg_idx
  on threads (clerk_user_id, last_message_at desc nulls last);

create table if not exists thread_participants (
  thread_id  uuid not null references threads(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  role       text not null check (role in ('from', 'to', 'cc')),
  primary key (thread_id, contact_id, role)
);
create index if not exists thread_participants_contact_idx
  on thread_participants (contact_id);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_google_connections_updated_at on google_connections;
create trigger trg_google_connections_updated_at
  before update on google_connections
  for each row execute function set_updated_at();
