-- =============================================================================
-- 0017_profile_stats_unread.sql
--
-- Adds an unread count (reading_status = 'want_to_read') to profile_stats for
-- the profile screen's stats card. create or replace view, same pattern
-- 0011 and 0014 used — keeps the view's identity (and its security_invoker,
-- grants, and RLS-equivalent auth.uid() scoping) intact rather than
-- dropping and recreating it.
-- =============================================================================

-- create or replace view only allows appending columns, never inserting or
-- reordering them (0015_households.sql's library_entries has the same
-- note) — unread_books has to go after every existing column, not grouped
-- next to finished_books/reading_books where it reads more naturally.
create or replace view profile_stats
with (security_invoker = false)
as
select
  p.id as user_id,
  count(ub.id) filter (where ub.id is not null)                                as total_books,
  count(ub.id) filter (where ub.reading_status = 'finished')                   as finished_books,
  count(ub.id) filter (where ub.reading_status = 'reading')                    as reading_books,
  count(ub.id) filter (where ub.availability_type in ('exchange', 'exchange_or_sale')) as exchange_count,
  count(ub.id) filter (where ub.availability_type in ('sale', 'exchange_or_sale'))     as sale_count,
  count(ub.id) filter (where ub.reading_status = 'want_to_read')               as unread_books
from profiles p
left join user_books ub on ub.user_id = p.id
where p.id = auth.uid()
group by p.id;
