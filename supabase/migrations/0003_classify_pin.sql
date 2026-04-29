-- Orbit v2: contact classification + pinning + AI summary cache.
-- All columns default to safe values so existing rows continue to work.

alter table contacts
  add column if not exists kind            text not null default 'unknown',
  add column if not exists kind_reason     text,
  add column if not exists kind_locked     boolean not null default false,
  add column if not exists is_pinned       boolean not null default false,
  add column if not exists ai_summary      text,
  add column if not exists ai_summary_at   timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_kind_check'
  ) then
    alter table contacts
      add constraint contacts_kind_check
      check (kind in ('person','newsletter','automated','noreply','spam','unknown'));
  end if;
end$$;

create index if not exists contacts_kind_idx
  on contacts (clerk_user_id, kind, last_interaction_at desc nulls last);

create index if not exists contacts_pinned_idx
  on contacts (clerk_user_id, is_pinned)
  where is_pinned = true;
