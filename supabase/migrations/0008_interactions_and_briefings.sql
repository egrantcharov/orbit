-- Orbit v3.5: agency layer.
--
-- 1) interactions table: unified timeline per contact. Email threads stay
--    in `threads`, but everything else (manual notes, voice memos,
--    calendar events the contact attended, in-person logs) flows here.
--    Today section + meeting briefs read from this table to generate
--    action cards instead of just looking at Gmail metadata.
--
-- 2) briefings table: cache for Claude-generated cards. Two kinds:
--    'today' (per-user daily list of action cards) and 'meeting' (per
--    calendar-event prep card). Avoids re-generating on every page load.

-- 1) interactions ---------------------------------------------------------

create table if not exists interactions (
  id              uuid        primary key default uuid_generate_v4(),
  clerk_user_id   text        not null references app_users(clerk_user_id) on delete cascade,
  contact_id      uuid        not null references contacts(id) on delete cascade,
  -- 'email_thread' | 'calendar_event' | 'note' | 'voice_memo' | 'phone' | 'imessage'
  kind            text        not null,
  occurred_at     timestamptz not null default now(),
  title           text,                            -- short summary or subject
  body            text,                            -- full text or transcript
  source_id       text,                            -- gmail thread id, calendar event id, etc.
  source_url      text,                            -- e.g. event htmlLink
  created_at      timestamptz not null default now(),
  constraint interactions_kind_check
    check (kind in ('email_thread','calendar_event','note','voice_memo','phone','imessage'))
);

create index if not exists interactions_contact_idx
  on interactions (contact_id, occurred_at desc);
create index if not exists interactions_user_idx
  on interactions (clerk_user_id, occurred_at desc);
create unique index if not exists interactions_source_unique
  on interactions (clerk_user_id, kind, source_id)
  where source_id is not null;

alter table interactions enable row level security;

-- 2) briefings cache ------------------------------------------------------

create table if not exists briefings (
  id              uuid        primary key default uuid_generate_v4(),
  clerk_user_id   text        not null references app_users(clerk_user_id) on delete cascade,
  -- 'today' (one row per user, latest wins) or 'meeting' (per event)
  kind            text        not null check (kind in ('today','meeting')),
  ref_id          text,                            -- calendar event id for 'meeting'; null for 'today'
  body            jsonb       not null,            -- structured card list (see Today/Meeting endpoints)
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz                      -- optional TTL hint
);

create unique index if not exists briefings_today_unique
  on briefings (clerk_user_id) where kind = 'today';
create unique index if not exists briefings_meeting_unique
  on briefings (clerk_user_id, ref_id) where kind = 'meeting' and ref_id is not null;

alter table briefings enable row level security;
