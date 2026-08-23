-- =============================================================================
-- 0021_user_books_total_pages.sql — a per-copy fallback total page count, for
-- when the catalog's own books.page_count is unknown.
--
-- books.page_count is shared and creator-only ("creator can correct a book",
-- 0003_rls.sql), so a household member reading a copy someone else added has
-- no way to fill it in. A page count is a fact about the physical copy, not
-- the reader, so it belongs on user_books rather than on the per-person
-- reading_progress table (0020_reading_progress.sql) — and user_books' own
-- "edit own copies" policy already lets any household member update a shared
-- copy, not just whoever added it, so one person filling this in benefits
-- everyone sharing that copy.
-- =============================================================================

alter table user_books
  add column total_pages int check (total_pages > 0);

-- Re-run verbatim from 0020_reading_progress.sql, with total_pages appended
-- at the end — create or replace view only allows appending columns, not
-- inserting or reordering them.
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

  ub.total_pages
from user_books ub
join books b                     on b.id = ub.book_id
left join bookshelf_positions bp on bp.id = ub.bookshelf_position_id
left join bookshelves bs         on bs.id = bp.bookshelf_id
left join public_profiles pp     on pp.id = ub.user_id
left join reading_progress rp    on rp.user_book_id = ub.id and rp.user_id = auth.uid();
