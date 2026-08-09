-- =============================================================================
-- 0003_rls.sql — row level security
--
-- The privacy rule that drives all of this:
--   * A user's library, reviews, ratings, notes and shelf layout are PRIVATE.
--   * A copy marked exchange/sale becomes readable by everyone, but only the
--     listing fields — the owner's review and shelf position never travel with
--     it, because they live on the same row and are filtered by the view.
--   * Contact details are never in a browsable table; they come from a
--     SECURITY DEFINER function that requires a session.
-- =============================================================================

alter table locations           enable row level security;
alter table categories          enable row level security;
alter table profiles            enable row level security;
alter table books               enable row level security;
alter table book_categories     enable row level security;
alter table bookshelves         enable row level security;
alter table bookshelf_positions enable row level security;
alter table user_books          enable row level security;
alter table user_book_photos    enable row level security;
alter table contact_requests    enable row level security;
alter table listing_reports     enable row level security;

-- -----------------------------------------------------------------------------
-- Reference data — readable by anyone, writable by nobody through the API
-- -----------------------------------------------------------------------------

create policy "locations are public"
  on locations for select
  to anon, authenticated
  using (true);

create policy "categories are public"
  on categories for select
  to anon, authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- Profiles — owner-only. Everyone else reads the public_profiles view.
-- -----------------------------------------------------------------------------

create policy "read own profile"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "update own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- INSERT is handled by the on_auth_user_created trigger, but keep a policy so a
-- profile can be recreated if one is ever missing.
create policy "insert own profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- Books — a shared catalog. Readable by all, appendable by any signed-in user.
--
-- Updates are limited to the row's creator. Anyone may add a book nobody has
-- catalogued yet, but nobody can rewrite the metadata of a book that hundreds of
-- other users already have on their shelves.
-- -----------------------------------------------------------------------------

create policy "books are public"
  on books for select
  to anon, authenticated
  using (true);

create policy "signed-in users can add books"
  on books for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "creator can correct a book"
  on books for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "book categories are public"
  on book_categories for select
  to anon, authenticated
  using (true);

create policy "signed-in users can categorise books"
  on book_categories for insert
  to authenticated
  with check (true);

-- -----------------------------------------------------------------------------
-- Bookshelves and positions — strictly private
-- -----------------------------------------------------------------------------

create policy "own bookshelves"
  on bookshelves for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- user_id is filled in by the set_position_user_id trigger, which reads it from
-- the parent bookshelf; the WITH CHECK below runs after that trigger.
create policy "own bookshelf positions"
  on bookshelf_positions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- User books — owner-only, full stop.
--
-- There is deliberately no "other people's listings are readable" policy here.
-- Rating, review and notes sit on this row, and a SELECT policy grants whole
-- rows, not chosen columns — so opening the table up for discovery would publish
-- every user's private review alongside the price. Strangers read the `listings`
-- view instead, which names the columns they are allowed to see.
-- -----------------------------------------------------------------------------

create policy "read own copies"
  on user_books for select
  to authenticated
  using (auth.uid() = user_id);

create policy "add own copies"
  on user_books for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "edit own copies"
  on user_books for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own copies"
  on user_books for delete
  to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Listing photos — visible with the listing they belong to
--
-- The helper is SECURITY DEFINER because a subquery inside a policy is still
-- subject to the *other* table's RLS. Reading `user_books` inline would find
-- nothing for a stranger and every photo would vanish from the listing.
-- -----------------------------------------------------------------------------

create or replace function user_book_is_listed(p_user_book_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from user_books
    where id = p_user_book_id and availability_type <> 'private'
  );
$$;

grant execute on function user_book_is_listed(uuid) to anon, authenticated;

create policy "read photos of visible copies"
  on user_book_photos for select
  to anon, authenticated
  using (
    user_id = auth.uid() or user_book_is_listed(user_book_id)
  );

create policy "manage own photos"
  on user_book_photos for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from user_books ub
      where ub.id = user_book_photos.user_book_id and ub.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Contact requests — both parties can see their own; inserts go through
-- request_contact() below, which is what fills in to_user_id correctly.
-- -----------------------------------------------------------------------------

create policy "read own contact requests"
  on contact_requests for select
  to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- -----------------------------------------------------------------------------
-- Reports — write-only from the client's point of view
-- -----------------------------------------------------------------------------

create policy "anyone signed in can report a listing"
  on listing_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

create policy "read own reports"
  on listing_reports for select
  to authenticated
  using (auth.uid() = reporter_id);

-- =============================================================================
-- request_contact — the only way to obtain an owner's contact details.
--
-- Doing it as a function rather than a column means the contact tap and the
-- metric are the same event: you cannot read a phone number without leaving a
-- row behind in contact_requests.
-- =============================================================================

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
  v_owner uuid;
  v_availability availability_type;
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

-- =============================================================================
-- Grants
--
-- RLS decides which rows; these decide which relations are reachable at all.
-- =============================================================================

grant usage on schema public to anon, authenticated;

grant select on locations, categories, books, book_categories to anon, authenticated;
grant select on public_profiles, listings, profile_stats to anon, authenticated;
grant select on user_book_photos to anon, authenticated;

grant select, insert, update on profiles to authenticated;
grant insert, update on books to authenticated;
grant insert on book_categories to authenticated;
grant select, insert, update, delete on bookshelves, bookshelf_positions to authenticated;

-- Note the absence of `anon` here, and see the comment on the user_books
-- policies: the discovery screen reads the `listings` view, never this table.
grant select, insert, update, delete on user_books to authenticated;
grant insert, update, delete on user_book_photos to authenticated;
grant select on library_entries to authenticated;
grant select on contact_requests to authenticated;
grant select, insert on listing_reports to authenticated;
