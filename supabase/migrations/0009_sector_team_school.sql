-- Orbit v3.6: spreadsheet-style network view.
--
-- Adds the dimensions a user actually thinks in when networking — sector
-- (sub-bucket of industry, e.g., 'Investment Banking' inside 'Finance'),
-- team / group (e.g., 'TMT', 'Healthcare Coverage'), and school. These
-- power the new /app/network grouped pivot view.

alter table contacts
  add column if not exists sector  text,
  add column if not exists team    text,
  add column if not exists school  text;

create index if not exists contacts_industry_idx on contacts (clerk_user_id, industry);
create index if not exists contacts_sector_idx   on contacts (clerk_user_id, sector);
create index if not exists contacts_company_idx  on contacts (clerk_user_id, company);
