-- Orbit v3: CSV-first pivot. Contacts are owned by the user (LinkedIn export,
-- generic CSV, or manual entry). Mailboxes are interchangeable enrichment
-- sources searched per known contact, never crawled to discover senders.
--
-- This migration:
--   1) Renames google_connections → mailbox_connections, adds provider /
--      account_email, switches to (clerk_user_id, provider, account_email)
--      identity. v3 still asserts one mailbox per user in code.
--   2) Adds contacts.is_archived (replaces is_hidden semantically). Backfills
--      from the v2 hide state, preserving manually-classified rows.
--   3) Adds threads.mailbox_id (FK), provider_thread_id (rename of
--      gmail_thread_id), and content_hash for future cross-mailbox dedupe.
--   4) Creates enrichment_state for resumable bulk enrichment runs.
--
-- The deprecated v2 columns (kind, kind_reason, kind_locked, is_hidden,
-- hidden_reason) are LEFT IN PLACE. Migration 0007 drops them after v3
-- stabilizes — gives us a release cycle to catch any forgotten read sites.

create extension if not exists "uuid-ossp";

-- 1) mailbox_connections ----------------------------------------------------

-- Rename only if not already renamed (idempotent re-runs).
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'google_connections') then
    alter table google_connections rename to mailbox_connections;
  end if;
end$$;

alter table mailbox_connections
  add column if not exists provider      text not null default 'gmail',
  add column if not exists account_email text,
  add column if not exists id            uuid not null default uuid_generate_v4();

-- backfill account_email from the legacy google_email column
update mailbox_connections
  set account_email = google_email
  where account_email is null;

alter table mailbox_connections
  alter column account_email set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mailbox_provider_check') then
    alter table mailbox_connections
      add constraint mailbox_provider_check check (provider in ('gmail','outlook'));
  end if;
end$$;

-- swap PK: clerk_user_id (legacy) → id (uuid). Composite uniqueness via index.
do $$
begin
  -- legacy PK had different names depending on migration ordering; drop any.
  if exists (select 1 from pg_constraint
              where conname in ('google_connections_pkey','mailbox_connections_pkey')) then
    execute (
      'alter table mailbox_connections drop constraint ' ||
      (select conname from pg_constraint
        where conname in ('google_connections_pkey','mailbox_connections_pkey')
        limit 1)
    );
  end if;
end$$;

alter table mailbox_connections add primary key (id);

create unique index if not exists mailbox_user_provider_account_uniq
  on mailbox_connections (clerk_user_id, provider, lower(account_email));

-- 2) contacts.is_archived ---------------------------------------------------

alter table contacts
  add column if not exists is_archived boolean not null default false;

-- Backfill: archive rows that v2 considered noise. Preserve user overrides
-- (kind_locked=true never gets archived) and any kind='person' row regardless
-- of source.
update contacts
   set is_archived = true
 where is_archived = false
   and kind_locked = false
   and (
        is_hidden = true
     or kind in ('newsletter','automated','noreply','spam','bulk_marketing','transactional','unknown')
   )
   and (source is null or source = 'gmail');

create index if not exists contacts_archived_idx
  on contacts (clerk_user_id, is_archived);

-- 3) threads: mailbox_id, provider_thread_id, content_hash ------------------

alter table threads
  add column if not exists mailbox_id          uuid references mailbox_connections(id) on delete cascade,
  add column if not exists content_hash        text,
  add column if not exists provider_thread_id  text;

-- backfill provider_thread_id from legacy gmail_thread_id
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='threads' and column_name='gmail_thread_id') then
    update threads
       set provider_thread_id = gmail_thread_id
     where provider_thread_id is null;
  end if;
end$$;

-- backfill mailbox_id from each user's single existing mailbox row
update threads t
   set mailbox_id = mc.id
  from mailbox_connections mc
 where mc.clerk_user_id = t.clerk_user_id
   and t.mailbox_id is null;

create unique index if not exists threads_mailbox_provider_uniq
  on threads (mailbox_id, provider_thread_id)
  where mailbox_id is not null and provider_thread_id is not null;

-- 4) enrichment_state -------------------------------------------------------

create table if not exists enrichment_state (
  clerk_user_id  text        not null references app_users(clerk_user_id) on delete cascade,
  mailbox_id     uuid        not null references mailbox_connections(id) on delete cascade,
  contact_id     uuid        not null references contacts(id) on delete cascade,
  status         text        not null default 'idle' check (status in ('idle','running','done','error','skipped')),
  threads_found  integer     not null default 0,
  last_run_at    timestamptz,
  error_message  text,
  primary key (mailbox_id, contact_id)
);

create index if not exists enrichment_state_user_status_idx
  on enrichment_state (clerk_user_id, status);

alter table enrichment_state enable row level security;
