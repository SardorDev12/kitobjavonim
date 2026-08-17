-- =============================================================================
-- 0015_households.sql — shared household libraries ("family account")
--
-- A household is a small group of people who share one physical library.
-- Sharing is per-row and opt-in: `household_id` is nullable on `bookshelves`
-- and `user_books`, so every existing row (null today) keeps behaving exactly
-- as it does now — nothing becomes shared just because this migration ran.
-- A member can still keep a personal shelf or copy alongside shared ones.
--
-- One household per person (`household_members.user_id` is unique) — keeps
-- "which household is this person's" a plain lookup, no active-household
-- switcher needed anywhere in the app.
--
-- Deliberately untouched: `plan_limits`/freemium caps stay per-individual,
-- and a listed book's contact identity is still whoever's `user_id` added it
-- (via `public_profiles`/`request_contact()`), not the household — both are
-- separable features, not required for "we can see each other's shelf."
-- =============================================================================

create table households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) > 0),
  invite_code  text not null unique,
  created_by   uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table household_members (
  household_id  uuid not null references households (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),

  primary key (household_id, user_id),
  unique (user_id)
);

create index household_members_household_idx on household_members (household_id);

alter table bookshelves add column household_id uuid references households (id) on delete set null;
alter table user_books  add column household_id uuid references households (id) on delete set null;

create index bookshelves_household_idx on bookshelves (household_id) where household_id is not null;
create index user_books_household_idx  on user_books  (household_id) where household_id is not null;

-- -----------------------------------------------------------------------------
-- Helpers — security definer, same reasoning as user_book_is_listed (0003):
-- a subquery inside a policy is still subject to the *other* table's RLS, so a
-- plain "exists (select 1 from household_members ...)" inline would find
-- nothing (and silently deny) for rows the caller shouldn't be able to prove
-- membership through in the first place.
-- -----------------------------------------------------------------------------

create or replace function is_household_member(p_household_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_household_id is not null and exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = auth.uid()
  );
$$;

grant execute on function is_household_member(uuid) to authenticated;

create or replace function is_household_owner(p_household_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_household_id is not null and exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = auth.uid() and role = 'owner'
  );
$$;

grant execute on function is_household_owner(uuid) to authenticated;

-- bookshelf_positions carries no household_id of its own (sharing is
-- inherited from its parent shelf, same as position.user_id already mirrors
-- the shelf's creator) — this looks that up without depending on the
-- caller already having RLS access to the bookshelves row.
create or replace function bookshelf_household_id(p_bookshelf_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from bookshelves where id = p_bookshelf_id;
$$;

grant execute on function bookshelf_household_id(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- user_id is attribution ("who added this"), not a toggle — RLS's WITH CHECK
-- alone can't stop a household member's update from also silently
-- reassigning a shared row's user_id, since the OR-of-household clause below
-- would still pass on the new value's household_id regardless. Block it
-- outright instead of relying on WITH CHECK to catch every angle.
-- -----------------------------------------------------------------------------

create or replace function assert_user_id_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger bookshelves_user_id_immutable
  before update of user_id on bookshelves
  for each row execute function assert_user_id_immutable();

create trigger user_books_user_id_immutable
  before update of user_id on user_books
  for each row execute function assert_user_id_immutable();

-- -----------------------------------------------------------------------------
-- A position must belong to the same user as the book being placed on it —
-- OR to a household shelf the book's owner belongs to. Without the ownership
-- half, a crafted request could reference another user's shelf id; without
-- the household half, a member could never actually place a book on the
-- shared shelf they just joined.
-- -----------------------------------------------------------------------------

create or replace function assert_position_ownership()
returns trigger
language plpgsql
as $$
declare
  position_owner     uuid;
  position_household uuid;
begin
  if new.bookshelf_position_id is null then
    return new;
  end if;

  select bp.user_id, bookshelf_household_id(bp.bookshelf_id)
    into position_owner, position_household
  from bookshelf_positions bp
  where bp.id = new.bookshelf_position_id;

  if position_owner is null then
    raise exception 'bookshelf position does not belong to this user';
  end if;

  if position_owner <> new.user_id and not is_household_member(position_household) then
    raise exception 'bookshelf position does not belong to this user';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS — extend the existing owner-only policies (0003) with a household
-- branch. user_id stays the INSERT gate everywhere (a member can only ever
-- create rows attributed to themselves — sharing is the household_id they
-- attach, never a reassignment of whose row it is).
-- -----------------------------------------------------------------------------

alter policy "own bookshelves" on bookshelves
  using (auth.uid() = user_id or is_household_member(household_id))
  with check (auth.uid() = user_id or is_household_member(household_id));

alter policy "own bookshelf positions" on bookshelf_positions
  using (auth.uid() = user_id or is_household_member(bookshelf_household_id(bookshelf_id)))
  with check (auth.uid() = user_id or is_household_member(bookshelf_household_id(bookshelf_id)));

alter policy "read own copies" on user_books
  using (auth.uid() = user_id or is_household_member(household_id));

alter policy "add own copies" on user_books
  with check (auth.uid() = user_id and (household_id is null or is_household_member(household_id)));

alter policy "edit own copies" on user_books
  using (auth.uid() = user_id or is_household_member(household_id))
  with check (auth.uid() = user_id or is_household_member(household_id));

alter policy "delete own copies" on user_books
  using (auth.uid() = user_id or is_household_member(household_id));

-- -----------------------------------------------------------------------------
-- households / household_members — membership changes (create/join/leave/
-- remove/regenerate) all go through the functions below, not raw
-- insert/update/delete, so there is no client-facing write policy for most
-- of this beyond what those functions (security definer, bypass RLS as the
-- owning role) need. Dissolving is the one exception: a plain delete, gated
-- by the owner-only policy, is simple enough not to need its own function —
-- `on delete cascade`/`set null` above clean up membership and un-share
-- everything automatically.
-- -----------------------------------------------------------------------------

alter table households        enable row level security;
alter table household_members enable row level security;

create policy "members read their household"
  on households for select
  to authenticated
  using (is_household_member(id));

create policy "owner renames household"
  on households for update
  to authenticated
  using (is_household_owner(id))
  with check (is_household_owner(id));

create policy "owner dissolves household"
  on households for delete
  to authenticated
  using (is_household_owner(id));

create policy "members read their household roster"
  on household_members for select
  to authenticated
  using (is_household_member(household_id));

grant select on households, household_members to authenticated;
grant update (name), delete on households to authenticated;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

create or replace function generate_household_invite_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_code     text;
  v_attempts int := 0;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    v_attempts := v_attempts + 1;
    exit when not exists (select 1 from households where invite_code = v_code) or v_attempts > 20;
  end loop;

  if v_attempts > 20 then
    raise exception 'could not generate an invite code, try again';
  end if;

  return v_code;
end;
$$;

create or replace function create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'household_already_member' using errcode = 'P0001';
  end if;

  if length(btrim(p_name)) = 0 then
    raise exception 'name is required';
  end if;

  insert into households (name, invite_code, created_by)
  values (btrim(p_name), generate_household_invite_code(), auth.uid())
  returning id into v_household_id;

  insert into household_members (household_id, user_id, role)
  values (v_household_id, auth.uid(), 'owner');

  return v_household_id;
end;
$$;

revoke all on function create_household(text) from public;
grant execute on function create_household(text) to authenticated;

create or replace function join_household(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'household_already_member' using errcode = 'P0001';
  end if;

  select id into v_household_id
  from households
  where invite_code = upper(btrim(p_invite_code));

  if v_household_id is null then
    raise exception 'household_invalid_code' using errcode = 'P0002';
  end if;

  insert into household_members (household_id, user_id, role)
  values (v_household_id, auth.uid(), 'member');

  return v_household_id;
end;
$$;

revoke all on function join_household(text) from public;
grant execute on function join_household(text) to authenticated;

-- If the owner leaves and someone's left, ownership passes to whoever
-- joined earliest rather than leaving the household ownerless. If nobody's
-- left, the household itself is done — dissolve it the same way an owner's
-- direct delete would (on delete cascade/set null clean up the rest).
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

revoke all on function leave_household() from public;
grant execute on function leave_household() to authenticated;

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

  delete from household_members
  where household_id = v_household_id and user_id = p_user_id;
end;
$$;

revoke all on function remove_household_member(uuid) from public;
grant execute on function remove_household_member(uuid) to authenticated;

create or replace function regenerate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_code         text;
begin
  select household_id into v_household_id
  from household_members
  where user_id = auth.uid() and role = 'owner';

  if v_household_id is null then
    raise exception 'household_owner_only' using errcode = '42501';
  end if;

  v_code := generate_household_invite_code();
  update households set invite_code = v_code where id = v_household_id;
  return v_code;
end;
$$;

revoke all on function regenerate_invite_code() from public;
grant execute on function regenerate_invite_code() to authenticated;

-- -----------------------------------------------------------------------------
-- library_entries — add household_id and who-added-it, so the UI can show a
-- shared entry's attribution without a second round trip. CREATE OR REPLACE
-- VIEW only allows appending columns, never reordering, so the existing list
-- (0002, appended to by 0007) is reproduced exactly and these go at the end.
-- Joins public_profiles, not profiles directly: this view is
-- security_invoker, and a household member has no RLS access to another
-- member's raw profiles row.
-- -----------------------------------------------------------------------------

create or replace view library_entries
with (security_invoker = true)
as
select
  ub.id,
  ub.user_id,
  ub.book_id,
  ub.reading_status,
  ub.condition,
  ub.rating,
  ub.review,
  ub.notes,
  ub.date_added,
  ub.date_finished,
  ub.availability_type,
  ub.listed_at,
  ub.exchange_preferences,
  ub.sale_price,
  ub.sale_currency,
  ub.price_negotiable,
  ub.sale_description,
  ub.bookshelf_position_id,
  ub.updated_at,

  b.title,
  b.subtitle,
  b.authors,
  b.cover_url,
  b.isbn13,
  b.publisher,
  b.publication_year,
  b.language,
  b.page_count,
  b.description,

  bs.id            as bookshelf_id,
  bs.name          as bookshelf_name,
  bs.sort_order    as bookshelf_sort_order,
  bp.shelf_number,
  bp.row_number,
  bp.label         as position_label,

  b.created_by     as book_created_by,

  ub.household_id,
  pp.display_name  as added_by_name,
  pp.avatar_url    as added_by_avatar_url
from user_books ub
join books b                     on b.id = ub.book_id
left join bookshelf_positions bp on bp.id = ub.bookshelf_position_id
left join bookshelves bs         on bs.id = bp.bookshelf_id
left join public_profiles pp     on pp.id = ub.user_id;
