-- Orbit v2: bookmarks (library page) + cached weekly digests.

create table if not exists bookmarks (
  id            uuid        primary key default uuid_generate_v4(),
  clerk_user_id text        not null references app_users(clerk_user_id) on delete cascade,
  url           text        not null,
  title         text,
  description   text,
  kind          text        not null default 'other',
  tags          text[]      not null default '{}',
  created_at    timestamptz not null default now(),
  unique (clerk_user_id, url)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookmarks_kind_check'
  ) then
    alter table bookmarks
      add constraint bookmarks_kind_check
      check (kind in ('github','newsletter','article','tool','other'));
  end if;
end$$;

create index if not exists bookmarks_user_idx
  on bookmarks (clerk_user_id, created_at desc);

create table if not exists digests (
  clerk_user_id text         not null references app_users(clerk_user_id) on delete cascade,
  week_start    date         not null,
  body          text         not null,
  contacts_in   int          not null default 0,
  threads_in    int          not null default 0,
  created_at    timestamptz  not null default now(),
  primary key (clerk_user_id, week_start)
);

alter table bookmarks enable row level security;
alter table digests   enable row level security;
