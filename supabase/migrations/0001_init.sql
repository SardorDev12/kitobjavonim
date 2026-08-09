-- =============================================================================
-- 0001_init.sql — extensions, enums, core tables, indexes, triggers
--
-- Design notes:
--   * `books` is the canonical, shared record. `user_books` is one physical copy
--     owned by one user. Two users owning "Atomic Habits" share one `books` row.
--   * A user may legitimately own two copies of the same book, so there is no
--     unique (user_id, book_id) constraint. The app warns about duplicates in
--     the UI instead of forbidding them in the schema.
--   * Physical location lives on `user_books`, never on `books`.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- fuzzy title/author search
create extension if not exists "unaccent";   -- accent-insensitive search

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type reading_status as enum ('want_to_read', 'reading', 'finished');

create type availability_type as enum ('private', 'exchange', 'sale', 'exchange_or_sale');

create type book_condition as enum ('new', 'like_new', 'good', 'fair', 'poor');

create type contact_channel as enum ('telegram', 'phone');

create type metadata_source as enum ('google_books', 'open_library', 'manual');

-- -----------------------------------------------------------------------------
-- Reference data: locations
--
-- Self-referencing so regions and districts share one table. `level` is
-- 'region' for a top-level entry (Tashkent city, Samarqand region, ...) and
-- 'district' for anything nested under it. Names are stored per-locale because
-- the app ships in Uzbek, Russian and English.
-- -----------------------------------------------------------------------------

create table locations (
  id          text primary key,
  parent_id   text references locations (id) on delete cascade,
  level       text not null check (level in ('region', 'district')),
  name_uz     text not null,
  name_ru     text not null,
  name_en     text not null,
  sort_order  int  not null default 0
);

create index locations_parent_idx on locations (parent_id, sort_order);

-- -----------------------------------------------------------------------------
-- Reference data: categories
-- -----------------------------------------------------------------------------

create table categories (
  id          text primary key,
  name_uz     text not null,
  name_ru     text not null,
  name_en     text not null,
  sort_order  int  not null default 0
);

-- -----------------------------------------------------------------------------
-- Profiles — one row per auth user, created automatically by trigger
-- -----------------------------------------------------------------------------

create table profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text not null default '',
  avatar_url         text,
  bio                text,
  region_id          text references locations (id) on delete set null,
  district_id        text references locations (id) on delete set null,
  telegram_username  text,
  phone              text,
  show_phone         boolean not null default false,
  preferred_locale   text not null default 'uz' check (preferred_locale in ('uz', 'ru', 'en')),
  onboarded_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Stored without the leading @ so links can be built predictably.
  constraint telegram_username_format
    check (telegram_username is null or telegram_username ~ '^[A-Za-z0-9_]{4,32}$'),
  constraint phone_format
    check (phone is null or phone ~ '^\+?[0-9]{7,15}$')
);

-- -----------------------------------------------------------------------------
-- Books — the canonical catalog, shared by every user
--
-- These two helpers exist because `array_to_string` is only STABLE (its
-- volatility accounts for element output functions that could vary), and
-- Postgres refuses both generated columns and expression indexes built on
-- anything less than IMMUTABLE. For text[] the result genuinely is immutable,
-- so the wrappers assert that and let `authors` participate in search.
-- -----------------------------------------------------------------------------

create or replace function authors_text(p_authors text[])
returns text
language sql
immutable
as $$
  select coalesce(array_to_string(p_authors, ' '), '');
$$;

create or replace function books_search_document(
  p_title     text,
  p_subtitle  text,
  p_authors   text[],
  p_publisher text
)
returns tsvector
language sql
immutable
as $$
  select to_tsvector('simple',
    coalesce(p_title, '') || ' ' ||
    coalesce(p_subtitle, '') || ' ' ||
    authors_text(p_authors) || ' ' ||
    coalesce(p_publisher, ''));
$$;

create table books (
  id                uuid primary key default gen_random_uuid(),
  isbn13            text unique,
  isbn10            text,
  title             text not null check (length(btrim(title)) > 0),
  subtitle          text,
  authors           text[] not null default '{}',
  publisher         text,
  publication_year  int check (publication_year between 1400 and 2200),
  language          text,                       -- ISO 639-1, e.g. 'uz', 'ru', 'en'
  cover_url         text,
  page_count        int check (page_count > 0),
  description       text,
  source            metadata_source not null default 'manual',
  source_id         text,                       -- provider's own id, for refresh
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- 'simple' rather than a language-specific config on purpose: the catalog
  -- mixes Uzbek, Russian and English, and no single stemmer serves all three.
  -- The trigram indexes below cover the partial matching stemming would give.
  -- Stored as a real column so PostgREST can run `.textSearch()` against it.
  search_vector tsvector generated always as (
    books_search_document(title, subtitle, authors, publisher)
  ) stored
);

create index books_search_idx on books using gin (search_vector);

create index books_title_trgm_idx   on books using gin (title gin_trgm_ops);
create index books_authors_trgm_idx on books using gin (authors_text(authors) gin_trgm_ops);
create index books_isbn13_idx       on books (isbn13) where isbn13 is not null;
create index books_language_idx     on books (language);

create table book_categories (
  book_id      uuid not null references books (id) on delete cascade,
  category_id  text not null references categories (id) on delete cascade,
  primary key (book_id, category_id)
);

create index book_categories_category_idx on book_categories (category_id);

-- -----------------------------------------------------------------------------
-- Bookshelves and positions
--
-- `user_id` is duplicated onto positions so RLS policies stay single-table
-- lookups instead of joining back through bookshelves on every row.
-- -----------------------------------------------------------------------------

create table bookshelves (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),

  unique (user_id, name)
);

create index bookshelves_user_idx on bookshelves (user_id, sort_order);

create table bookshelf_positions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  bookshelf_id   uuid not null references bookshelves (id) on delete cascade,
  shelf_number   int  not null check (shelf_number > 0),
  row_number     int  not null check (row_number > 0),
  label          text,          -- optional override, e.g. "Top shelf, behind the plants"
  created_at     timestamptz not null default now(),

  unique (bookshelf_id, shelf_number, row_number)
);

create index bookshelf_positions_user_idx  on bookshelf_positions (user_id);
create index bookshelf_positions_shelf_idx on bookshelf_positions (bookshelf_id, shelf_number, row_number);

-- -----------------------------------------------------------------------------
-- User books — a user's physical copy
-- -----------------------------------------------------------------------------

create table user_books (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  book_id               uuid not null references books (id) on delete restrict,
  bookshelf_position_id uuid references bookshelf_positions (id) on delete set null,

  reading_status        reading_status not null default 'want_to_read',
  condition             book_condition,
  rating                int check (rating between 1 and 5),
  review                text,
  notes                 text,

  date_added            timestamptz not null default now(),
  date_finished         date,

  availability_type     availability_type not null default 'private',
  listed_at             timestamptz,
  exchange_preferences  text,

  sale_price            numeric(14, 2) check (sale_price >= 0),
  sale_currency         text not null default 'UZS',
  price_negotiable      boolean not null default false,
  sale_description      text,

  updated_at            timestamptz not null default now(),

  -- A sale listing without a price is not a listing.
  constraint sale_requires_price check (
    availability_type not in ('sale', 'exchange_or_sale') or sale_price is not null
  ),
  -- Ratings and reviews only make sense once the book is finished.
  constraint review_requires_finished check (
    (rating is null and review is null and date_finished is null)
    or reading_status = 'finished'
  )
);

create index user_books_user_idx         on user_books (user_id, date_added desc);
create index user_books_book_idx         on user_books (book_id);
create index user_books_status_idx       on user_books (user_id, reading_status);
create index user_books_position_idx     on user_books (bookshelf_position_id);
create index user_books_availability_idx on user_books (availability_type, listed_at desc)
  where availability_type <> 'private';

-- -----------------------------------------------------------------------------
-- Photos attached to a listing (condition shots for exchange/sale)
-- -----------------------------------------------------------------------------

create table user_book_photos (
  id            uuid primary key default gen_random_uuid(),
  user_book_id  uuid not null references user_books (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  storage_path  text not null,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

create index user_book_photos_book_idx on user_book_photos (user_book_id, sort_order);

-- -----------------------------------------------------------------------------
-- Contact requests
--
-- Contact happens off-platform (Telegram / phone), but every tap is recorded
-- here. "Successful connections between owners and interested readers" is the
-- headline metric in the PRD, and this table is the only place it can come from.
-- -----------------------------------------------------------------------------

create table contact_requests (
  id            uuid primary key default gen_random_uuid(),
  user_book_id  uuid not null references user_books (id) on delete cascade,
  from_user_id  uuid not null references auth.users (id) on delete cascade,
  to_user_id    uuid not null references auth.users (id) on delete cascade,
  channel       contact_channel not null,
  message       text,
  created_at    timestamptz not null default now(),

  constraint no_self_contact check (from_user_id <> to_user_id)
);

create index contact_requests_to_idx   on contact_requests (to_user_id, created_at desc);
create index contact_requests_from_idx on contact_requests (from_user_id, created_at desc);
create index contact_requests_book_idx on contact_requests (user_book_id);

-- -----------------------------------------------------------------------------
-- Reports — minimal moderation surface so bad listings can be pulled
-- -----------------------------------------------------------------------------

create table listing_reports (
  id            uuid primary key default gen_random_uuid(),
  user_book_id  uuid not null references user_books (id) on delete cascade,
  reporter_id   uuid not null references auth.users (id) on delete cascade,
  reason        text not null,
  details       text,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),

  unique (user_book_id, reporter_id)
);

-- =============================================================================
-- Triggers
-- =============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at   before update on profiles   for each row execute function set_updated_at();
create trigger books_updated_at      before update on books      for each row execute function set_updated_at();
create trigger user_books_updated_at before update on user_books for each row execute function set_updated_at();

-- Keep `listed_at` in sync with availability so discovery can sort by "newest
-- listing" without the client ever having to set it.
create or replace function sync_listed_at()
returns trigger
language plpgsql
as $$
begin
  if new.availability_type = 'private' then
    new.listed_at := null;
  elsif tg_op = 'INSERT' or old.availability_type = 'private' then
    new.listed_at := now();
  end if;
  return new;
end;
$$;

create trigger user_books_sync_listed_at
  before insert or update of availability_type on user_books
  for each row execute function sync_listed_at();

-- A position must belong to the same user as the book being placed on it.
-- Without this, a crafted request could reference another user's shelf id.
create or replace function assert_position_ownership()
returns trigger
language plpgsql
as $$
declare
  position_owner uuid;
begin
  if new.bookshelf_position_id is null then
    return new;
  end if;

  select user_id into position_owner
  from bookshelf_positions
  where id = new.bookshelf_position_id;

  if position_owner is null or position_owner <> new.user_id then
    raise exception 'bookshelf position does not belong to this user';
  end if;

  return new;
end;
$$;

create trigger user_books_assert_position
  before insert or update of bookshelf_position_id on user_books
  for each row execute function assert_position_ownership();

-- Positions inherit their owner from the parent bookshelf, so the client never
-- supplies user_id and cannot get it wrong.
create or replace function set_position_user_id()
returns trigger
language plpgsql
as $$
begin
  select user_id into new.user_id from bookshelves where id = new.bookshelf_id;
  if new.user_id is null then
    raise exception 'bookshelf not found';
  end if;
  return new;
end;
$$;

create trigger bookshelf_positions_set_user
  before insert or update of bookshelf_id on bookshelf_positions
  for each row execute function set_position_user_id();

-- Create the profile row the moment a user signs up, so the app never has to
-- handle a logged-in user with no profile.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
