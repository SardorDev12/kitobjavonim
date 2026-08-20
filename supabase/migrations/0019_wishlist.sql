-- =============================================================================
-- 0019_wishlist.sql — wishlist: books not yet owned
--
-- `user_books.reading_status = 'want_to_read'` only exists once a book is
-- already catalogued and owned (a user_books row implies a physical copy —
-- see 0001_init.sql's header). It says "I own this, haven't started it,"
-- not "I want to acquire this." This table adds the latter, deliberately
-- decoupled from user_books.
--
-- Denormalized, not FK'd to `books`: a wishlist row is one person's want,
-- not a shared catalog entry, and most wanted titles will never be
-- catalogued by anyone. Storing title/authors/isbn/cover_url etc. directly
-- (mirroring the app's BookCandidate shape) means adding an item needs no
-- ensureBook()-style lookup, and converting a want into an owned copy has
-- everything it needs without a join. Contrast with useAddBook, which DOES
-- dedupe into a shared `books` row — a user_books copy is a claim on the
-- shared catalog; a wishlist item never is.
--
-- No unique constraint on isbn13: duplicate detection ("already own it" /
-- "already on the wishlist") is a client-side check, the same pattern
-- add/configure.tsx's own `duplicate` useMemo already uses against the
-- library. isbn13 can be null (manual entries), and wanting a second copy
-- or re-adding after removing one is legitimate — same reasoning as
-- user_books having no unique(user_id, book_id).
-- =============================================================================

create table wishlist_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  household_id      uuid references households (id) on delete set null,

  title             text not null check (length(btrim(title)) > 0),
  subtitle          text,
  authors           text[] not null default '{}',
  isbn13            text,
  isbn10            text,
  publisher         text,
  publication_year  int check (publication_year between 1400 and 2200),
  language          text,
  cover_url         text,
  page_count        int check (page_count > 0),
  description       text,
  source            metadata_source not null default 'manual',
  source_id         text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index wishlist_items_user_idx      on wishlist_items (user_id, created_at desc);
create index wishlist_items_household_idx on wishlist_items (household_id) where household_id is not null;

-- set_updated_at() (0001_init.sql) and assert_user_id_immutable()
-- (0015_households.sql) already exist — reused, not redefined.

create trigger wishlist_items_updated_at
  before update on wishlist_items
  for each row execute function set_updated_at();

create trigger wishlist_items_user_id_immutable
  before update of user_id on wishlist_items
  for each row execute function assert_user_id_immutable();

-- -----------------------------------------------------------------------------
-- RLS — split by operation, matching user_books rather than bookshelves'
-- single FOR ALL policy. The INSERT check is an AND
-- (auth.uid() = user_id AND (household_id is null OR is_household_member(..)))
-- so household_id only ever adds visibility, never lets a member insert a
-- row attributed to someone else — the same rule 0015_households.sql
-- states for user_books, which wishlist_items follows for the same reason.
-- -----------------------------------------------------------------------------

alter table wishlist_items enable row level security;

create policy "read own wishlist items"
  on wishlist_items for select
  to authenticated
  using (auth.uid() = user_id or is_household_member(household_id));

create policy "add own wishlist items"
  on wishlist_items for insert
  to authenticated
  with check (auth.uid() = user_id and (household_id is null or is_household_member(household_id)));

create policy "edit own wishlist items"
  on wishlist_items for update
  to authenticated
  using (auth.uid() = user_id or is_household_member(household_id))
  with check (auth.uid() = user_id or is_household_member(household_id));

create policy "delete own wishlist items"
  on wishlist_items for delete
  to authenticated
  using (auth.uid() = user_id or is_household_member(household_id));

-- -----------------------------------------------------------------------------
-- wishlist_entries — adds who-added-it, same reason as library_entries
-- (0015_households.sql): a household member has no RLS access to another
-- member's raw `profiles` row, so this joins `public_profiles` instead. No
-- other join is needed — every book field already lives on wishlist_items.
-- -----------------------------------------------------------------------------

create view wishlist_entries
with (security_invoker = true)
as
select
  wi.*,
  pp.display_name as added_by_name,
  pp.avatar_url    as added_by_avatar_url
from wishlist_items wi
left join public_profiles pp on pp.id = wi.user_id;

grant select, insert, update, delete on wishlist_items to authenticated;
grant select on wishlist_entries to authenticated;
