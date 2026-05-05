-- Orbit v3.7: Reading queue.
--
-- Two new tables:
--   publications: a feed the user subscribes to (Substack, newsletter,
--     blog RSS, etc.). Per-user — different users have different
--     subscriptions. Polled on demand or via cron later.
--   articles: individual items pulled from each publication's feed.
--     TLDR cached on the row to avoid regeneration cost.

create table if not exists publications (
  id              uuid        primary key default uuid_generate_v4(),
  clerk_user_id   text        not null references app_users(clerk_user_id) on delete cascade,
  name            text        not null,
  feed_url        text        not null,
  site_url        text,
  description     text,
  favicon_url     text,
  last_polled_at  timestamptz,
  poll_error      text,
  created_at      timestamptz not null default now()
);

create unique index if not exists publications_user_feed_uniq
  on publications (clerk_user_id, lower(feed_url));
create index if not exists publications_user_idx
  on publications (clerk_user_id, last_polled_at desc nulls last);

alter table publications enable row level security;

create table if not exists articles (
  id                uuid        primary key default uuid_generate_v4(),
  clerk_user_id     text        not null references app_users(clerk_user_id) on delete cascade,
  publication_id    uuid        not null references publications(id) on delete cascade,
  guid              text,            -- feed-provided unique id when present
  url               text        not null,
  title             text,
  author            text,
  snippet           text,            -- short excerpt from feed
  content_excerpt   text,            -- longer body fetched on demand
  published_at      timestamptz,
  fetched_at        timestamptz not null default now(),
  is_read           boolean     not null default false,
  is_starred        boolean     not null default false,
  tldr              text,
  tldr_takeaways    jsonb,
  tldr_at           timestamptz
);

create unique index if not exists articles_pub_guid_uniq
  on articles (publication_id, lower(guid)) where guid is not null;
create unique index if not exists articles_pub_url_uniq
  on articles (publication_id, lower(url));
create index if not exists articles_user_published_idx
  on articles (clerk_user_id, published_at desc nulls last);
create index if not exists articles_user_unread_idx
  on articles (clerk_user_id, is_read, published_at desc nulls last);

alter table articles enable row level security;
