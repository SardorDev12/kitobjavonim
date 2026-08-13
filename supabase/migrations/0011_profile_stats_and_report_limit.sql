-- =============================================================================
-- 0011_profile_stats_and_report_limit.sql
--
-- Two gaps found in an RLS audit:
--
-- 1. profile_stats (0002_views.sql) has security_invoker = false and is
--    granted to anon, so it bypasses profiles/user_books RLS entirely with
--    no row filter of its own — any caller, signed in or not, could read
--    ANY user's book counts by querying ?user_id=eq.<uuid> directly against
--    PostgREST. The app itself only ever asks for the current user's own
--    (src/lib/queries/profile.ts), but nothing at the database enforced
--    that. Scoping the view to auth.uid() closes it without changing the
--    column list, so the client query is unaffected.
--
-- 2. listing_reports had a unique(user_book_id, reporter_id) constraint —
--    stops re-reporting the same listing, but nothing stopped one account
--    from filing reports against many different listings in a burst. A
--    generous daily cap (well above anything a genuine report ever needs)
--    closes that without touching the legitimate path.
-- =============================================================================

create or replace view profile_stats
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
where p.id = auth.uid()
group by p.id;

create or replace function enforce_report_rate_limit()
returns trigger
language plpgsql
as $$
declare
  v_recent_count int;
  v_cap constant int := 20;
begin
  select count(*) into v_recent_count
  from listing_reports
  where reporter_id = new.reporter_id
    and created_at >= now() - interval '24 hours';

  if v_recent_count >= v_cap then
    raise exception 'report_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger listing_reports_rate_limit
  before insert on listing_reports
  for each row execute function enforce_report_rate_limit();
