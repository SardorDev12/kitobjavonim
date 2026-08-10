-- =============================================================================
-- 0007_library_entries_book_owner.sql — expose who may edit a book's metadata
--
-- `books` RLS ("creator can correct a book", 0003) already restricts updates to
-- the row's own creator — anyone may add a book nobody has catalogued yet, but
-- not rewrite the metadata of one that other people's libraries already depend
-- on. The client had no way to know which case it was in, so it could not
-- decide whether to offer an Edit action. This adds that one column.
--
-- CREATE OR REPLACE VIEW only allows appending columns, never inserting or
-- reordering, which is why this is a new migration rather than an edit to
-- 0002 — the existing column list must be reproduced exactly as it was.
-- =============================================================================

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

  b.created_by     as book_created_by
from user_books ub
join books b                on b.id = ub.book_id
left join bookshelf_positions bp on bp.id = ub.bookshelf_position_id
left join bookshelves bs         on bs.id = bp.bookshelf_id;
