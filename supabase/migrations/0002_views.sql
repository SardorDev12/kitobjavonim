-- =============================================================================
-- 0002_views.sql — read models for the app
-- =============================================================================

-- -----------------------------------------------------------------------------
-- public_profiles — the safe projection of a profile.
--
-- `profiles` itself is readable only by its owner (see 0003_rls.sql). This view
-- is how everyone else sees a user: display name, avatar, approximate location,
-- Telegram handle, and the phone number *only* when the owner opted in.
--
-- security_invoker = false on purpose: the view runs as its owner so it can read
-- past the owner-only RLS policy on `profiles`, and the column list is what
-- limits what escapes.
-- -----------------------------------------------------------------------------

create view public_profiles
with (security_invoker = false)
as
select
  p.id,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.region_id,
  p.district_id,
  p.telegram_username,
  case when p.show_phone then p.phone end as phone,
  p.created_at
from profiles p;

-- -----------------------------------------------------------------------------
-- listings — every non-private copy, flattened for the discovery screen.
--
-- security_invoker = false, and `user_books` is NOT directly selectable by
-- clients (see 0003_rls.sql). That combination matters: `user_books` holds the
-- owner's private review, rating and notes on the very same row as the listing
-- fields. If clients could read the table directly, a row-level "listings are
-- public" policy would hand those columns over too, because RLS filters rows
-- and not columns. Routing every reader through this view makes the column list
-- below the hard boundary of what a stranger can see.
-- -----------------------------------------------------------------------------

create view listings
with (security_invoker = false)
as
select
  ub.id,
  ub.user_id,
  ub.book_id,
  ub.availability_type,
  ub.condition,
  ub.sale_price,
  ub.sale_currency,
  ub.price_negotiable,
  ub.sale_description,
  ub.exchange_preferences,
  ub.listed_at,

  b.title,
  b.subtitle,
  b.authors,
  b.cover_url,
  b.language,
  b.isbn13,
  b.publisher,
  b.publication_year,
  b.search_vector,

  pp.display_name as owner_name,
  pp.avatar_url   as owner_avatar_url,
  pp.region_id    as owner_region_id,
  pp.district_id  as owner_district_id,
  -- Contact details are deliberately absent. Anonymous visitors can browse
  -- listings, so exposing phone numbers or handles here would publish them to
  -- scrapers. They come from request_contact() instead, which requires a login.

  (select array_agg(bc.category_id) from book_categories bc where bc.book_id = b.id)
    as category_ids,
  (select count(*) from user_book_photos ph where ph.user_book_id = ub.id)
    as photo_count
from user_books ub
join books b            on b.id = ub.book_id
join public_profiles pp on pp.id = ub.user_id
where ub.availability_type <> 'private';

-- -----------------------------------------------------------------------------
-- library_entries — a user's own shelf, joined to book metadata and position.
--
-- security_invoker = true here, unlike `listings`: this view is meant to return
-- the private columns, and the owner-only RLS policy on `user_books` is exactly
-- the filter we want, so it should apply.
-- -----------------------------------------------------------------------------

create view library_entries
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
  bp.label         as position_label
from user_books ub
join books b                on b.id = ub.book_id
left join bookshelf_positions bp on bp.id = ub.bookshelf_position_id
left join bookshelves bs         on bs.id = bp.bookshelf_id;

-- -----------------------------------------------------------------------------
-- profile_stats — the counters shown on the profile screen.
-- -----------------------------------------------------------------------------

create view profile_stats
with (security_invoker = false)
as
select
  p.id as user_id,
  count(ub.id) filter (where ub.id is not null)                                as total_books,
  count(ub.id) filter (where ub.reading_status = 'finished')                   as finished_books,
  count(ub.id) filter (where ub.reading_status = 'reading')                    as reading_books,
  count(ub.id) filter (where ub.availability_type in ('exchange', 'exchange_or_sale')) as exchange_count,
  count(ub.id) filter (where ub.availability_type in ('sale', 'exchange_or_sale'))     as sale_count
from profiles p
left join user_books ub on ub.user_id = p.id
group by p.id;
