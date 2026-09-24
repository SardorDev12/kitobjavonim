-- =============================================================================
-- 0028_replace_shelves_with_note.sql — shelves become a free-text note, not
-- a defined data model.
--
-- The structured bookshelf/position feature (named shelf → numeric shelf
-- number → numeric row number, 0001_init.sql) turned out not to match how
-- people actually think about where a book sits — testers found the
-- numbering confusing and the whole feature's purpose unclear. Replacing it
-- with a single free-text field: the user just writes wherever they want
-- ("top shelf in the living room", "office, next to the desk", anything),
-- same idea as a comment.
--
-- Deliberately NOT dropped: `bookshelves`, `bookshelf_positions`, and
-- `user_books.bookshelf_position_id` stay in the schema exactly as they
-- are — no data loss, no destructive migration, and nothing currently
-- reads them once the client stops writing to them. Existing structured
-- placements are backfilled into the new free-text field below so nobody's
-- "where is this book" information silently disappears; the old tables are
-- just no longer the thing the app writes to going forward.
-- =============================================================================

alter table user_books
  add column shelf_note text check (shelf_note is null or length(btrim(shelf_note)) <= 200);

-- One-time backfill: turn each existing structured position into the same
-- free text a user would have typed, so existing shelf placements survive
-- the switch as editable notes instead of vanishing. Mirrors formatPosition()'s
-- own display convention (src/lib/format.ts) — a custom position label wins
-- if the user set one, otherwise "Shelf N → Row M".
update user_books ub
set shelf_note = btrim(
  bs.name || ' → ' || coalesce(
    nullif(btrim(bp.label), ''),
    'Shelf ' || bp.shelf_number || ' → Row ' || bp.row_number
  )
)
from bookshelf_positions bp
join bookshelves bs on bs.id = bp.bookshelf_id
where ub.bookshelf_position_id = bp.id
  and ub.shelf_note is null;

-- Re-run verbatim from 0021_user_books_total_pages.sql, with shelf_note
-- appended at the end — create or replace view only allows appending
-- columns, not inserting, reordering, or removing them.
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
  rp.progress_percent,

  ub.total_pages,

  ub.shelf_note
from user_books ub
join books b                     on b.id = ub.book_id
left join bookshelf_positions bp on bp.id = ub.bookshelf_position_id
left join bookshelves bs         on bs.id = bp.bookshelf_id
left join public_profiles pp     on pp.id = ub.user_id
left join reading_progress rp    on rp.user_book_id = ub.id and rp.user_id = auth.uid();
