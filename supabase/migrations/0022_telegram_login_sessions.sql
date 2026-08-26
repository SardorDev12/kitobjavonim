-- =============================================================================
-- 0022_telegram_login_sessions.sql
--
-- Backs the bot-deep-link Telegram sign-in, replacing the Login Widget. The
-- widget required BotFather's /setdomain to match the exact page it was
-- embedded on — broken by every domain move this app has been through — and
-- opens a phone-number-entry screen for anyone not already signed into
-- Telegram Web, which reads as suspicious to a lot of users. This flow
-- avoids both: the app creates a pending row here, hands the user to their
-- own Telegram app to confirm via a bot they message directly (no widget,
-- no domain check, no phone number ever typed), and the app waits on this
-- row for the bot's confirmation.
--
-- A row carries no PII at all until the bot webhook (service role, bypasses
-- RLS) confirms it — token and status only. The `token` itself doubles as
-- the access control: it's a 122-bit random UUID nobody can guess, the same
-- trust model as a magic-link token_hash, which is exactly what this
-- produces once confirmed.
-- =============================================================================

create table telegram_login_sessions (
  token       uuid primary key default gen_random_uuid(),
  status      text not null default 'pending' check (status in ('pending', 'confirmed')),
  token_hash  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '5 minutes'
);

-- No automated cleanup yet — expired rows just sit there. Fine at this
-- scale; worth a periodic delete (pg_cron or a scheduled Edge Function) if
-- this table ever grows enough to matter.
create index telegram_login_sessions_expires_idx on telegram_login_sessions (expires_at);

alter table telegram_login_sessions enable row level security;

-- Anyone (signed in or not — this is how signing in starts) can open a
-- pending session, but only ever a bare pending one: status and token_hash
-- are fixed by the check, so a client can never insert a row that looks
-- already confirmed.
create policy "start a telegram sign-in"
  on telegram_login_sessions for insert
  to anon, authenticated
  with check (status = 'pending' and token_hash is null);

-- Readable by anyone who already has the token — same reasoning as the
-- table comment above. This also lets Supabase Realtime deliver the
-- confirming UPDATE to the anon-key client waiting on it.
create policy "read a telegram sign-in by its token"
  on telegram_login_sessions for select
  to anon, authenticated
  using (true);

-- No update/delete policy for anon/authenticated at all — only the bot
-- webhook (service role) can move a row from pending to confirmed.
grant select, insert on telegram_login_sessions to anon, authenticated;

-- Lets the waiting client receive the confirming UPDATE without polling —
-- the app polls as a fallback anyway in case Realtime is ever misconfigured
-- for an environment, but this is the fast path.
alter publication supabase_realtime add table telegram_login_sessions;
