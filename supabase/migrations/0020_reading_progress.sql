-- =============================================================================
-- 0020_reading_progress.sql — reading status, progress, and reviews become
-- per-person instead of per-copy
--
-- Until now, reading_status/rating/review/notes/date_finished lived on
-- user_books — one row per physical copy. That's fine for a personal
-- (unshared) copy, but a household-shared copy (0015_households.sql) is a
-- single row multiple people can already read/edit, which forced two
-- household members sharing one physical book to also share one reading
-- status and one review. This splits those fields into a new table keyed
-- by (copy, person), so each household member tracks their own reading
-- state on a shared copy independently. Also adds progress tracking
-- (current_page / progress_percent) and a start date, which didn't exist
-- at all before.
--
-- This is the first non-additive migration in this codebase — every prior
-- one only added columns/tables. This one backfills the new table from
-- user_books and then drops the columns that moved. The backfill runs
-- before the drop in the same transaction (the SQL editor wraps each file
-- in one, per docs/supabase-setup.md), so every existing copy's reading
-- state becomes its owner's own reading_progress row before the source
-- columns disappear — nothing is lost.
-- =============================================================================

create table reading_progress (
  id                uuid primary key default gen_random_uuid(),
  user_book_id      uuid not null references user_books (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,

  reading_status    reading_status not null default 'want_to_read',
  date_started      date,
  date_finished     date,
  current_page      int check (current_page > 0),
  progress_percent  int check (progress_percent between 0 and 100),
  rating            int check (rating between 1 and 5),
  review            text,
  notes             text,

  updated_at        timestamptz not null default now(),

  unique (user_book_id, user_id),
  -- Same rule user_books enforced before this migration moved it here.
  constraint review_requires_finished check (
    (rating is null and review is null and date_finished is null)
    or reading_status = 'finished'
  )
);

create index reading_progress_user_idx on reading_progress (user_id, reading_status);

create trigger reading_progress_updated_at
  before update on reading_progress
  for each row execute function set_updated_at();  -- 0001_init.sql

-- Backfill: every existing copy's own reading state becomes its owner's
-- personal record.
insert into reading_progress (user_book_id, user_id, reading_status, date_finished, rating, review, notes)
select id, user_id, reading_status, date_finished, rating, review, notes
from user_books;

alter table user_books
  drop column reading_status,
  drop column date_finished,
  drop column rating,
  drop column review,
  drop column notes;
-- user_books_status_idx (0001_init.sql), which indexed the now-dropped
-- reading_status column, is dropped automatically along with it.

-- -----------------------------------------------------------------------------
-- RLS — always own-rows-only. Unlike bookshelves/user_books, household
-- membership never grants read/write access to *another* member's
-- reading_progress row — the whole point of this table is that reading
-- state is personal, not shared. Household membership only matters for
-- INSERT, to confirm the copy being tracked is one this person actually
-- has legitimate access to (their own, or a shared household copy).
-- -----------------------------------------------------------------------------

alter table reading_progress enable row level security;

create policy "read own reading progress"
  on reading_progress for select
  to authenticated
  using (auth.uid() = user_id);

create policy "add own reading progress"
  on reading_progress for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from user_books ub
      where ub.id = user_book_id
        and (ub.user_id = auth.uid() or is_household_member(ub.household_id))
    )
  );

create policy "edit own reading progress"
  on reading_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own reading progress"
  on reading_progress for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on reading_progress to authenticated;

-- -----------------------------------------------------------------------------
-- library_entries — same full column list as before (0015_households.sql),
-- but reading_status/rating/review/notes/date_finished now come from the
-- viewer's own reading_progress row instead of user_books directly, and
-- date_started/current_page/progress_percent are appended at the end
-- (create or replace view only allows appending, never reordering).
--
-- Every user_books row has a reading_progress row for its owner (backfilled
-- above, and inserted alongside every new book going forward — see
-- useAddBook), so the join always resolves for the owner's own view. For a
-- household member viewing a shared copy they haven't personally started
-- tracking, rp is null: reading_status correctly falls back to
-- 'want_to_read', and the rest (rating/review/notes/dates/progress) is
-- simply null — "nothing tracked yet", which every read site already
-- treats as empty.
-- -----------------------------------------------------------------------------

create or replace view library_entries
with (security_invoker = true)
as
select
  ub.id,
  ub.user_id,
  ub.book_id,
  coalesce(rp.reading_status, 'want_to_read') as reading_status,
  ub.condition,
  rp.rating,
  rp.review,
  rp.notes,
  ub.date_added,
  rp.date_finished,
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
  pp.avatar_url    as added_by_avatar_url,

  rp.date_started,
  rp.current_page,
  rp.progress_percent
from user_books ub
join books b                     on b.id = ub.book_id
left join bookshelf_positions bp on bp.id = ub.bookshelf_position_id
left join bookshelves bs         on bs.id = bp.bookshelf_id
left join public_profiles pp     on pp.id = ub.user_id
left join reading_progress rp    on rp.user_book_id = ub.id and rp.user_id = auth.uid();

-- -----------------------------------------------------------------------------
-- profile_stats — same aggregate columns and the same
-- where p.id = auth.uid() scoping as 0017_profile_stats_unread.sql (still
-- only counts books the viewer owns; extending it to shared copies is a
-- separate decision), sourcing reading_status from the viewer's own
-- reading_progress row instead of user_books directly. Same
-- coalesce(..., 'want_to_read') fallback as library_entries, for the same
-- reason: a user_books row can briefly exist with no matching
-- reading_progress row yet (useAddBook's two-insert sequence isn't
-- transactional) — without the fallback such a row would silently vanish
-- from every one of these counts instead of reading as "unread".
-- -----------------------------------------------------------------------------

create or replace view profile_stats
with (security_invoker = false)
as
select
  p.id as user_id,
  count(ub.id) filter (where ub.id is not null)                                                             as total_books,
  count(ub.id) filter (where coalesce(rp.reading_status, 'want_to_read') = 'finished')                       as finished_books,
  count(ub.id) filter (where coalesce(rp.reading_status, 'want_to_read') = 'reading')                        as reading_books,
  count(ub.id) filter (where ub.availability_type in ('exchange', 'exchange_or_sale'))                       as exchange_count,
  count(ub.id) filter (where ub.availability_type in ('sale', 'exchange_or_sale'))                           as sale_count,
  count(ub.id) filter (where coalesce(rp.reading_status, 'want_to_read') = 'want_to_read')                   as unread_books
from profiles p
left join user_books ub       on ub.user_id = p.id
left join reading_progress rp on rp.user_book_id = ub.id and rp.user_id = p.id
where p.id = auth.uid()
group by p.id;
