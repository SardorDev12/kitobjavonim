-- =============================================================================
-- 0018_app_config.sql
--
-- A tiny public key/value table for values the app needs to read without a
-- redeploy — starting with latest_android_version, which drives the
-- dismissible "update available" prompt on launch. Publicly readable (no
-- write policy for anon/authenticated at all — updated by hand from the SQL
-- editor when a new version ships), same shape as reference data like
-- locations/categories.
-- =============================================================================

create table app_config (
  key   text primary key,
  value text not null
);

alter table app_config enable row level security;

create policy "app_config is public" on app_config for select to anon, authenticated using (true);

grant select on app_config to anon, authenticated;

insert into app_config (key, value) values ('latest_android_version', '0.2.0');
