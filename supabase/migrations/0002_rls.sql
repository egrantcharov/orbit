-- Lock down all tables. Service role bypasses RLS, so server-side code
-- still works. The anon/authenticated keys cannot read or write anything
-- without explicit policies (which we deliberately don't add in v1).

alter table app_users           enable row level security;
alter table google_connections  enable row level security;
alter table contacts            enable row level security;
alter table threads             enable row level security;
alter table thread_participants enable row level security;
