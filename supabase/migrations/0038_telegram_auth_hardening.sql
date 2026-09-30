-- =============================================================================
-- 0038_telegram_auth_hardening.sql
--
-- Three gaps found comparing the Telegram sign-in Edge Function
-- (supabase/functions/telegram-auth) against a formal Telegram Login Widget
-- spec: no explicit, queryable identity key for a Telegram account; no
-- per-login timestamp; no rate limiting on the verification endpoint.
--
-- 1. telegram_id / telegram_last_login_at
--    Telegram identity has always been enforced *implicitly* — the Edge
--    Function creates each Telegram user under a synthetic
--    tg_<id>@telegram.local email, and auth.users.email is unique, so the
--    same Telegram id can never map to two Supabase accounts. That's a real
--    guarantee, but there was no queryable telegram_id column anywhere:
--    identity only existed inside auth.users.raw_user_meta_data, which
--    RLS-governed tables and ordinary SQL can't join against. A plain
--    `unique` column (not a partial index) is enough here — Postgres already
--    treats multiple NULLs as distinct, so non-Telegram accounts (NULL) never
--    collide with each other.
--
-- 2. telegram_auth_attempts / enforce_telegram_auth_rate_limit
--    The verification endpoint had no throttling at all beyond the HMAC check
--    itself — nothing stopped a burst of requests (valid or malformed) aimed
--    at one Telegram id or from one IP. This follows the same
--    before-insert-trigger-with-a-cap pattern already used for
--    listing_reports_rate_limit (0011_profile_stats_and_report_limit.sql):
--    the Edge Function inserts one attempt row per callback before doing any
--    real work, and the trigger rejects the insert once either cap is
--    exceeded within the window. Both dimensions are capped independently
--    (per Telegram id AND per IP) since either alone misses a real pattern —
--    one id hit from rotating IPs, or many ids hit from one IP.
--
--    Caps are deliberately generous: a genuine user might retry a few times
--    after a flaky network, and Telegram's widget itself can't be rate
--    limited client-side, so this only needs to blunt automated abuse, not
--    inconvenience a real retry.
-- =============================================================================

alter table profiles
  add column telegram_id bigint unique,
  add column telegram_last_login_at timestamptz;

create table telegram_auth_attempts (
  id bigint generated always as identity primary key,
  telegram_id text not null,
  client_ip text not null,
  created_at timestamptz not null default now()
);

-- No RLS policy is added — this table is only ever touched by the
-- Edge Function via the service-role key, which bypasses RLS entirely, same
-- as app_config's insert-once-by-hand convention. Nothing else should read
-- or write it.
alter table telegram_auth_attempts enable row level security;

create index telegram_auth_attempts_telegram_id_idx on telegram_auth_attempts (telegram_id, created_at);
create index telegram_auth_attempts_client_ip_idx on telegram_auth_attempts (client_ip, created_at);

create or replace function enforce_telegram_auth_rate_limit()
returns trigger
language plpgsql
as $$
declare
  v_window constant interval := interval '5 minutes';
  v_id_cap constant int := 10;
  v_ip_cap constant int := 30;
  v_id_count int;
  v_ip_count int;
begin
  select count(*) into v_id_count
  from telegram_auth_attempts
  where telegram_id = new.telegram_id
    and created_at >= now() - v_window;

  if v_id_count >= v_id_cap then
    raise exception 'telegram_auth_rate_limited' using errcode = 'P0001';
  end if;

  select count(*) into v_ip_count
  from telegram_auth_attempts
  where client_ip = new.client_ip
    and created_at >= now() - v_window;

  if v_ip_count >= v_ip_cap then
    raise exception 'telegram_auth_rate_limited' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger telegram_auth_rate_limit
  before insert on telegram_auth_attempts
  for each row execute function enforce_telegram_auth_rate_limit();
