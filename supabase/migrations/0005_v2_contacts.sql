-- Orbit v2: enrichment fields, multi-dim relationship scores, soft-hide,
-- LinkedIn import support, body excerpts on threads, and a self-profile
-- jsonb on app_users to ground the scoring engine.
-- Idempotent: every column / constraint / index is guarded so re-runs are
-- safe across local dev + prod.

-- contacts: enrichment + scores + source + hide flag --------------------

alter table contacts
  add column if not exists source             text        not null default 'gmail',
  add column if not exists is_hidden          boolean     not null default false,
  add column if not exists hidden_reason      text,
  add column if not exists linkedin_url       text,
  add column if not exists company            text,
  add column if not exists job_title          text,
  add column if not exists industry           text,
  add column if not exists location           text,
  add column if not exists birthday           date,
  add column if not exists tags               text[]      not null default '{}',
  add column if not exists notes              text,
  add column if not exists user_sent_count    integer     not null default 0,
  add column if not exists user_replied_count integer     not null default 0,
  add column if not exists score_closeness         real,
  add column if not exists score_keep_in_touch     real,
  add column if not exists score_industry_overlap  real,
  add column if not exists score_age_proximity     real,
  add column if not exists score_career_relevance  real,
  add column if not exists scores_rationale   jsonb,
  add column if not exists scores_at          timestamptz;

-- LinkedIn-only rows can have no email. Allow null and replace the
-- old (clerk_user_id, email) unique constraint with a partial index.
alter table contacts alter column email drop not null;

alter table contacts drop constraint if exists contacts_clerk_user_id_email_key;

create unique index if not exists contacts_user_email_uniq
  on contacts (clerk_user_id, lower(email))
  where email is not null;

create unique index if not exists contacts_user_linkedin_uniq
  on contacts (clerk_user_id, linkedin_url)
  where linkedin_url is not null;

create index if not exists contacts_hidden_idx
  on contacts (clerk_user_id, is_hidden);

create index if not exists contacts_birthday_idx
  on contacts (clerk_user_id, birthday)
  where birthday is not null;

create index if not exists contacts_tags_gin
  on contacts using gin (tags);

create index if not exists contacts_score_keep_in_touch_idx
  on contacts (clerk_user_id, score_keep_in_touch desc nulls last)
  where score_keep_in_touch is not null;

-- Expand kind enum to include the two new classes used by the v2 heuristic.
alter table contacts drop constraint if exists contacts_kind_check;
alter table contacts drop constraint if exists contacts_kind_check_v2;
alter table contacts
  add constraint contacts_kind_check_v2
  check (kind in (
    'person','newsletter','automated','noreply','spam',
    'bulk_marketing','transactional','unknown'
  ));

-- Score values must be 0..1 (or null = not yet scored).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_scores_range_check') then
    alter table contacts add constraint contacts_scores_range_check check (
      (score_closeness        is null or (score_closeness        between 0 and 1)) and
      (score_keep_in_touch    is null or (score_keep_in_touch    between 0 and 1)) and
      (score_industry_overlap is null or (score_industry_overlap between 0 and 1)) and
      (score_age_proximity    is null or (score_age_proximity    between 0 and 1)) and
      (score_career_relevance is null or (score_career_relevance between 0 and 1))
    );
  end if;
end$$;

-- threads: body excerpt + signal columns --------------------------------

alter table threads
  add column if not exists body_excerpt        text,
  add column if not exists has_unsubscribe     boolean not null default false,
  add column if not exists reply_to            text,
  add column if not exists user_participated   boolean not null default false;

create index if not exists threads_user_participated_idx
  on threads (clerk_user_id, user_participated, last_message_at desc nulls last)
  where user_participated = true;

-- app_users: self-profile jsonb (industry, role, age_bracket, location) -

alter table app_users
  add column if not exists self_profile jsonb not null default '{}'::jsonb;
