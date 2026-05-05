-- Orbit v3.1: hard-delete the v2 auto-discovered junk and add richer
-- relationship metadata.
--
-- Why hard-delete instead of leaving archived: the user explicitly does
-- not want shop@emails.macys.com / deals@emails.flyfrontier.com / etc. to
-- exist anywhere. Archived rows were leaking into the v3 orphan-rescue
-- card. We purge them outright; v3 rebuilds the contact list from
-- LinkedIn / CSV / manual entry.

-- 1) Purge v2-era auto-discovered junk -------------------------------------
-- Delete every contact that was auto-discovered (source='gmail' or null)
-- AND archived AND has no LinkedIn URL AND was never manually overridden
-- (kind_locked=false). thread_participants links cascade-delete.
delete from contacts
 where (source is null or source = 'gmail')
   and is_archived = true
   and linkedin_url is null
   and kind_locked = false;

-- Also purge orphan threads no longer linked to any contact (cleanup).
delete from threads t
 where not exists (
   select 1 from thread_participants tp where tp.thread_id = t.id
 );

-- 2) Allow 'enrichment_stub' source for v3 participant stubs --------------
-- Future enrichment that creates participant rows tags them
-- source='enrichment_stub' so they're distinguishable from v2 'gmail' junk
-- and from real LinkedIn/manual contacts.
alter table contacts drop constraint if exists contacts_source_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_source_check_v2') then
    alter table contacts
      add constraint contacts_source_check_v2
      check (source in ('gmail','linkedin','csv','manual','enrichment_stub'));
  end if;
end$$;

-- 3) Richer relationship metadata -----------------------------------------
alter table contacts
  add column if not exists met_at        text,         -- where (city, event, conference)
  add column if not exists met_on        date,         -- when
  add column if not exists met_via       text,         -- how / introducer
  add column if not exists interests     text;         -- shared hobbies / topics

-- 4) Inbox/Calendar tabs don't need schema changes — they read from
--    Gmail/Calendar APIs directly via the user's OAuth grant.
