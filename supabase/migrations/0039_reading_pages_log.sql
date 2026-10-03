-- =============================================================================
-- 0039_reading_pages_log.sql
--
-- Pages read per day, so the stats page can show "pages read" for any day,
-- week, month or year — including pages read in a book that isn't finished
-- yet. reading_progress only keeps the latest page, not when it moved, so the
-- app now logs the difference every time the page changes.
--
-- Builds on reading_activity (one row per user per day, see 0036): adds a
-- running pages_read total to that day's row, and a function that adds to it
-- atomically (the app can't safely read-modify-write it from two devices).
--
-- Written going forward only: days before this runs have no page log, and the
-- stats page keeps counting those from finished books, as it always has.
-- =============================================================================

alter table reading_activity
  add column if not exists pages_read int not null default 0;

-- Adds p_pages (negative for a correction, e.g. a page typed wrong and fixed)
-- to the signed-in user's row for p_date, creating the row if there isn't one.
-- The total never goes below zero. security definer because the table only
-- grants select/insert to users; auth.uid() keeps it to the caller's own row.
create or replace function public.log_pages_read(p_pages int, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  insert into reading_activity (user_id, activity_date, pages_read)
  values (auth.uid(), p_date, greatest(p_pages, 0))
  on conflict (user_id, activity_date)
  do update set pages_read = greatest(reading_activity.pages_read + p_pages, 0);
end;
$$;

revoke all on function public.log_pages_read(int, date) from public;
grant execute on function public.log_pages_read(int, date) to authenticated;
