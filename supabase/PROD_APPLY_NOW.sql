-- =============================================================
-- Orbit prod migration pack: 0012 + 0013
-- =============================================================
-- Paste this whole file into the Supabase dashboard → SQL Editor → Run.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / ON CONFLICT).
-- After running, the new voice memo + AI summary features can read/write
-- their columns without 42703 ("column does not exist") errors.
--
-- This file is a concatenation of:
--   supabase/migrations/0012_voice_memos.sql
--   supabase/migrations/0013_interaction_ai.sql
-- It does NOT update the _orbit_migrations tracking table; if/when you
-- run `npm run migrate` later, both files will be marked applied via
-- their own inserts. To keep state perfectly in sync, after running this
-- you can also run the two `insert into _orbit_migrations` lines at the
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


-- ============== Optional: mark them applied ===================
-- Uncomment ONLY after the two ALTERs above succeeded. This keeps the
-- tracking table in sync so `npm run migrate` won't try to re-run them.
--
-- insert into _orbit_migrations (name) values
--   ('0012_voice_memos.sql'),
--   ('0013_interaction_ai.sql')
-- on conflict (name) do nothing;
