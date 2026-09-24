-- =============================================================================
-- 0027_fix_household_unshare_on_leave.sql — leaving/being removed from a
-- household didn't actually un-share your own content
--
-- A tester reported the real-world version of this: she created a
-- household, a member added his own books to it, he left — and his books
-- were still visible in her account afterwards.
--
-- 0015_households.sql's own comment claims "on delete cascade/set null ...
-- clean up membership and un-share everything automatically", but that
-- cascade only fires when the `households` row itself is deleted — which
-- leave_household() only does in ONE branch: when the leaving member was
-- the owner *and* was the last member left (dissolution). Every other case
-- — a non-owner leaving, an owner leaving while others remain, or
-- remove_household_member() — only ever deleted the household_members row.
-- The leaving/removed member's own `bookshelves.household_id` and
-- `user_books.household_id` were left pointing at the still-alive
-- household, so `is_household_member(household_id)` (evaluated from a
-- remaining member's own membership, which never changed) kept returning
-- true for everyone else in the household — their content stayed visible
-- to people they'd just left.
--
-- households_test.sql never caught this: it checks that the person who
-- left loses access to *others'* shared content, and still sees their own
-- (correct — ownership grants access regardless of household_id), but
-- never checks the symmetric case: whether the people who *stayed* still
-- see what the leaver shared. That's the actual bug, added as a new
-- assertion below.
-- =============================================================================

create or replace function leave_household()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_was_owner    boolean;
  v_next_owner   uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select household_id, role = 'owner' into v_household_id, v_was_owner
  from household_members
  where user_id = auth.uid();

  if v_household_id is null then
    raise exception 'not in a household' using errcode = 'P0002';
  end if;

  -- Un-share this member's own shelves/books before anything else below —
  -- the household may or may not get deleted (only when this was the last
  -- member), and either way this member's content must stop being visible
  -- to whoever remains. Harmless to run even when the household is about
  -- to be deleted: the FK's own `on delete set null` would otherwise do
  -- the same thing to the same rows.
  update bookshelves set household_id = null
  where user_id = auth.uid() and household_id = v_household_id;

  update user_books set household_id = null
  where user_id = auth.uid() and household_id = v_household_id;

  delete from household_members where user_id = auth.uid();

  if v_was_owner then
    select user_id into v_next_owner
    from household_members
    where household_id = v_household_id
    order by joined_at
    limit 1;

    if v_next_owner is not null then
      update household_members set role = 'owner'
      where household_id = v_household_id and user_id = v_next_owner;
    else
      delete from households where id = v_household_id;
    end if;
  end if;
end;
$$;

create or replace function remove_household_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id
  from household_members
  where user_id = auth.uid() and role = 'owner';

  if v_household_id is null then
    raise exception 'household_owner_only' using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'use leave_household() to remove yourself' using errcode = 'P0001';
  end if;

  -- Same un-sharing leave_household() does above — being removed must stop
  -- this member's own content from staying visible to the household just
  -- as leaving voluntarily would.
  update bookshelves set household_id = null
  where user_id = p_user_id and household_id = v_household_id;

  update user_books set household_id = null
  where user_id = p_user_id and household_id = v_household_id;

  delete from household_members
  where household_id = v_household_id and user_id = p_user_id;
end;
$$;
