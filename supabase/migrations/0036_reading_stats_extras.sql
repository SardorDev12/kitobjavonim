-- =============================================================================
-- 0036_reading_stats_extras.sql
--
-- Two small, unrelated-but-shipped-together additions for the reading-stats
-- page's "goal" and "streak" sections:
--
-- 1. profiles.reading_goal_books — an optional personal target ("read 20
--    books this year"), same shape as preferred_locale: a plain profile
--    column, editable by its own owner only.
--
-- 2. reading_activity — one row per (user, day) a person touched their
--    reading progress. reading_progress itself only ever holds the latest
--    state (current_page, reading_status, ...), not a history of every day
--    it changed, so a streak can't be reconstructed from it after the fact.
--    This is written going forward, one upsert per useUpdateReadingProgress
--    call (see src/lib/queries/library.ts) — best-effort, same as any other
--    "nice to have, must never block the save it rides along with" write in
--    this app.
-- =============================================================================

alter table profiles
  add column if not exists reading_goal_books int;

alter table profiles
  add constraint reading_goal_books_positive check (reading_goal_books is null or reading_goal_books > 0);

create table reading_activity (
  user_id        uuid not null references profiles (id) on delete cascade,
  activity_date  date not null,
  primary key (user_id, activity_date)
);

alter table reading_activity enable row level security;

create policy "users can view their own reading activity"
  on reading_activity for select
  to authenticated
  using (user_id = auth.uid());

create policy "users can log their own reading activity"
  on reading_activity for insert
  to authenticated
  with check (user_id = auth.uid());

grant select, insert on reading_activity to authenticated;
