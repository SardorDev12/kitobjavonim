-- =============================================================================
-- Plans and freemium limits — docs/prd-monetization.md, Feature 1.
--
-- Free: 10 concurrent active listings, 3 distinct listings contacted per
-- calendar month, uncapped personal cataloging. Pro: unlimited on both.
-- Numbers live in plan_limits rather than hardcoded in the functions below,
-- so tuning a cap later is an UPDATE, not a migration.
-- =============================================================================

alter table profiles
  add column plan             text not null default 'free' check (plan in ('free', 'pro')),
  add column plan_expires_at  timestamptz;

-- profiles already had a blanket `grant update on profiles to authenticated`
-- with no column restriction (RLS only checked auth.uid() = id, not which
-- columns changed) — harmless before now, but plan/plan_expires_at must never
-- be client-writable, or any signed-in user could grant themselves Pro
-- directly. Replacing the blanket grant with an explicit column list closes
-- that; plan/plan_expires_at are deliberately absent, so only a
-- security-definer function (or the service role, e.g. the payment webhook
-- in Feature 2) can ever change them.
revoke update on profiles from authenticated;
grant update (
  display_name, avatar_url, bio, region_id, district_id,
  telegram_username, phone, show_phone, preferred_locale, onboarded_at
) on profiles to authenticated;

create table plan_limits (
  plan                  text primary key,
  active_listing_cap    int not null,
  monthly_contact_cap   int not null
);
-- No FK to profiles.plan (that column isn't unique, so it can't be an FK
-- target) — the check constraint on profiles.plan above already keeps both
-- tables limited to the same two literal values.

comment on table plan_limits is
  'Per-plan caps for Feature 1 enforcement. 2147483647 (int4 max) means unlimited — no separate sentinel needed since a real cap will never reach it.';

insert into plan_limits (plan, active_listing_cap, monthly_contact_cap) values
  ('free', 10, 3),
  ('pro',  2147483647, 2147483647);

-- Plan status is time-bound (plan_expires_at), not just the raw `plan`
-- column — a lapsed Pro user must be treated as free everywhere without a
-- cron job to flip the column back. Centralized here so both enforcement
-- points (and the status function below) agree on what "currently Pro"
-- means.
create or replace function effective_plan(p_user_id uuid)
returns text
language sql
stable
as $$
  select case
    when plan = 'pro' and (plan_expires_at is null or plan_expires_at > now())
      then 'pro'
    else 'free'
  end
  from profiles
  where id = p_user_id;
$$;

-- -----------------------------------------------------------------------------
-- 1a. Active listing cap — extends the existing sync_listed_at() trigger
-- rather than adding a parallel mechanism, since it already runs at exactly
-- the moment a row transitions into a listed state (before insert or update
-- of availability_type) and already distinguishes that transition from an
-- ordinary edit to an already-listed row.
-- -----------------------------------------------------------------------------

create or replace function sync_listed_at()
returns trigger
language plpgsql
as $$
declare
  active_count int;
  cap          int;
begin
  if new.availability_type = 'private' then
    new.listed_at := null;
  elsif tg_op = 'INSERT' or old.availability_type = 'private' then
    select active_listing_cap into cap
    from plan_limits
    where plan = effective_plan(new.user_id);

    select count(*) into active_count
    from user_books
    where user_id = new.user_id and availability_type <> 'private';
    -- The row being transitioned isn't counted yet here: on INSERT it
    -- doesn't exist in the table; on UPDATE its stored value is still the
    -- pre-transition 'private'. So active_count >= cap means this would be
    -- the (cap+1)th active listing — reject it.

    if active_count >= cap then
      raise exception 'listing_limit_reached' using errcode = 'P0001';
    end if;

    new.listed_at := now();
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1b. Monthly contact-request quota — extends request_contact(), the sole
-- gateway to revealing an owner's contact details, so the check can never be
-- bypassed by going around it.
-- -----------------------------------------------------------------------------

create or replace function request_contact(
  p_user_book_id uuid,
  p_channel      contact_channel,
  p_message      text default null
)
returns table (
  owner_name         text,
  telegram_username  text,
  phone              text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner              uuid;
  v_availability       availability_type;
  v_already_contacted  boolean;
  v_monthly_count      int;
  v_cap                int;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select ub.user_id, ub.availability_type
    into v_owner, v_availability
  from user_books ub
  where ub.id = p_user_book_id;

  if v_owner is null then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;

  if v_availability = 'private' then
    raise exception 'this copy is not listed' using errcode = '42501';
  end if;

  if v_owner = auth.uid() then
    raise exception 'this listing is yours' using errcode = '42501';
  end if;

  -- Re-opening a contact already unlocked this month doesn't cost another
  -- slot — only a genuinely new listing being contacted counts toward quota.
  select exists (
    select 1 from contact_requests
    where from_user_id = auth.uid()
      and user_book_id = p_user_book_id
      and created_at >= date_trunc('month', now())
  ) into v_already_contacted;

  if not v_already_contacted then
    select monthly_contact_cap into v_cap
    from plan_limits
    where plan = effective_plan(auth.uid());

    select count(distinct user_book_id) into v_monthly_count
    from contact_requests
    where from_user_id = auth.uid()
      and created_at >= date_trunc('month', now());

    if v_monthly_count >= v_cap then
      raise exception 'contact_limit_reached' using errcode = 'P0001';
    end if;
  end if;

  insert into contact_requests (user_book_id, from_user_id, to_user_id, channel, message)
  values (p_user_book_id, auth.uid(), v_owner, p_channel, p_message);

  return query
  select p.display_name,
         p.telegram_username,
         case when p.show_phone then p.phone end
  from profiles p
  where p.id = v_owner;
end;
$$;

revoke all on function request_contact(uuid, contact_channel, text) from public;
grant execute on function request_contact(uuid, contact_channel, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Status readout for the client — the PRD requires remaining quota to be
-- visible before the wall is hit, not sprung on the user mid-flow.
-- -----------------------------------------------------------------------------

create or replace function my_plan_status()
returns table (
  plan                  text,
  plan_expires_at        timestamptz,
  active_listings        int,
  active_listing_cap     int,
  contacts_this_month    int,
  monthly_contact_cap    int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    effective_plan(auth.uid()),
    p.plan_expires_at,
    (select count(*) from user_books
       where user_id = auth.uid() and availability_type <> 'private'),
    pl.active_listing_cap,
    (select count(distinct user_book_id) from contact_requests
       where from_user_id = auth.uid() and created_at >= date_trunc('month', now())),
    pl.monthly_contact_cap
  from profiles p
  join plan_limits pl on pl.plan = effective_plan(auth.uid())
  where p.id = auth.uid();
$$;

revoke all on function my_plan_status() from public;
grant execute on function my_plan_status() to authenticated;
