-- Orbit v3.10: AI post-processing for interactions (starting with voice).
--
-- - `ai_title`: Claude-cleaned headline. The raw user-typed `title` stays
--   authoritative; ai_title is only shown when the user didn't type one.
-- - `ai_summary`: 2-3 sentence summary of the transcript / note.
-- - `ai_action_items`: short imperative follow-ups, jsonb array of strings.
-- - `ai_generated_at`: timestamp so we can refresh on demand later.

alter table interactions
  add column if not exists ai_title text,
  add column if not exists ai_summary text,
  add column if not exists ai_action_items jsonb,
  add column if not exists ai_generated_at timestamptz;
