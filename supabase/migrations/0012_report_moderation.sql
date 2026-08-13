-- =============================================================================
-- 0012_report_moderation.sql
--
-- listing_reports had an insert path (useReportListing) and nothing else —
-- no query anywhere in the client ever reads a report back, and the only
-- SELECT policy on the table ("read own reports") scopes to the reporter,
-- which is useless for actually moderating anything. A report nobody looks
-- at isn't a trust & safety feature, it's where complaints go to die.
--
-- This adds a minimal admin surface: an is_admin flag (not client-writable —
-- deliberately absent from profiles' column-scoped update grant, same
-- pattern as plan/plan_expires_at in 0008), and two SECURITY DEFINER RPCs
-- that check it themselves rather than needing new bypass policies on
-- user_books/profiles just to join in the listing/reporter/owner names for
-- display.
-- =============================================================================

alter table profiles
  add column is_admin boolean not null default false;

-- Taking a listing down is still a manual step via the Supabase dashboard
-- for now — this closes the "nobody ever sees a report" gap, not the whole
-- moderation surface.

create or replace function admin_list_reports()
returns table (
  report_id           uuid,
  user_book_id        uuid,
  reason              text,
  details             text,
  resolved_at         timestamptz,
  created_at          timestamptz,
  reporter_id         uuid,
  reporter_name       text,
  book_title          text,
  owner_id            uuid,
  owner_name          text,
  availability_type   availability_type
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.user_book_id, r.reason, r.details, r.resolved_at, r.created_at,
    r.reporter_id, rp.display_name,
    b.title,
    ub.user_id, op.display_name,
    ub.availability_type
  from listing_reports r
  join user_books ub on ub.id = r.user_book_id
  join books b        on b.id = ub.book_id
  join profiles rp    on rp.id = r.reporter_id
  join profiles op    on op.id = ub.user_id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
  order by r.resolved_at nulls first, r.created_at desc;
$$;

revoke all on function admin_list_reports() from public;
grant execute on function admin_list_reports() to authenticated;

create or replace function admin_resolve_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update listing_reports set resolved_at = now() where id = p_report_id;
end;
$$;

revoke all on function admin_resolve_report(uuid) from public;
grant execute on function admin_resolve_report(uuid) to authenticated;
