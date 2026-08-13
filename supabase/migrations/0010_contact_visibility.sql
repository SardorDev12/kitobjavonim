-- =============================================================================
-- 0010_contact_visibility.sql
--
-- Telegram gets the same opt-in visibility phone already had (0001_init.sql
-- added show_phone). Before this, telegram_username was always exposed by
-- public_profiles and request_contact() regardless of what the owner wanted.
-- Defaulting to true keeps every existing user exactly as reachable as they
-- were the moment before this migration ran — nothing goes silently dark.
-- =============================================================================

alter table profiles
  add column show_telegram boolean not null default true;

-- Additive: profiles' update grant is already an explicit column list
-- (0008_plans_and_limits.sql), and column-level GRANTs accumulate rather than
-- replace, so this only widens it by the one new column.
grant update (show_telegram) on profiles to authenticated;

create or replace view public_profiles
with (security_invoker = false)
as
select
  p.id,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.region_id,
  p.district_id,
  case when p.show_telegram then p.telegram_username end as telegram_username,
  case when p.show_phone then p.phone end as phone,
  p.created_at
from profiles p;

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
         case when p.show_telegram then p.telegram_username end,
         case when p.show_phone then p.phone end
  from profiles p
  where p.id = v_owner;
end;
$$;

revoke all on function request_contact(uuid, contact_channel, text) from public;
grant execute on function request_contact(uuid, contact_channel, text) to authenticated;
