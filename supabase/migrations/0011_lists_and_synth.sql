-- Orbit v3.8: daily-driver loop.
--
-- Three additions:
--   1) Smart Lists (lists + list_contacts) — saved filter combos with
--      optional ordered pipeline stages. Replaces the user's spreadsheet.
--   2) Auto-enrich tracking — contacts.taxonomy_inferred so the UI can
--      distinguish AI-filled fields from user-typed ones, plus a seniority
--      text column inferred alongside industry/sector/team.
--   3) Synth caching — extend briefings.kind to allow 'synth_daily' and
--      'synth_weekly'. The same TTL pattern as Today.

-- 1) Smart Lists --------------------------------------------------------

create table if not exists lists (
  id              uuid        primary key default uuid_generate_v4(),
  clerk_user_id   text        not null references app_users(clerk_user_id) on delete cascade,
  name            text        not null,
  description     text,
  filter          jsonb       not null default '{}'::jsonb,
  -- ordered list of stage labels; null/empty = no pipeline (just a saved filter)
  stages          text[],
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists lists_user_idx on lists (clerk_user_id, created_at desc);
alter table lists enable row level security;

create table if not exists list_contacts (
  list_id     uuid        not null references lists(id) on delete cascade,
  contact_id  uuid        not null references contacts(id) on delete cascade,
  stage       text,
  added_at    timestamptz  not null default now(),
  primary key (list_id, contact_id)
);
create index if not exists list_contacts_contact_idx on list_contacts (contact_id);
alter table list_contacts enable row level security;

-- updated_at trigger reused from 0001
drop trigger if exists trg_lists_updated_at on lists;
create trigger trg_lists_updated_at
  before update on lists
  for each row execute function set_updated_at();

-- 2) Auto-enrich tracking ----------------------------------------------

alter table contacts
  add column if not exists taxonomy_inferred  boolean not null default false,
  add column if not exists seniority           text;

-- 3) Synth briefing kinds -----------------------------------------------

alter table briefings drop constraint if exists briefings_kind_check;
alter table briefings drop constraint if exists briefings_kind_check_v2;
alter table briefings add constraint briefings_kind_check_v2
  check (kind in ('today','meeting','synth_daily','synth_weekly'));

-- partial-unique indexes for the new kinds (one synth_daily / weekly per user)
create unique index if not exists briefings_synth_daily_unique
  on briefings (clerk_user_id) where kind = 'synth_daily';
create unique index if not exists briefings_synth_weekly_unique
  on briefings (clerk_user_id) where kind = 'synth_weekly';
