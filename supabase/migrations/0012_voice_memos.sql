-- Orbit v3.9: voice memos as first-class interactions.
--
-- Audio recorded in the browser uploads to a private Supabase Storage bucket.
-- Transcript lives in `interactions.body` (already there). Audio metadata gets
-- three new nullable columns so existing interactions (notes, threads, etc.)
-- remain untouched.

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

-- Storage policies: NO direct anon/client reads or writes.
-- Service role bypasses RLS automatically, so server code uploads and
-- mints signed URLs without needing a permissive policy. The defaults on
-- storage.objects RLS-deny everything else.
--
-- (Keeping this explicit so a future contributor sees the intent.)

-- No-op: storage.objects RLS is already enabled by Supabase.
