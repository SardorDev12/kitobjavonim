-- =============================================================================
-- 0014_admin_audit_log.sql
--
-- Every mutating admin action (promote, demote, ban, delete, unlist, catalog
-- edit, report resolution, new-admin creation) now leaves a row behind:
-- who did it, to what, when. Before this, the only record of an admin
-- action was its effect — a banned account, a demoted profile — with no way
-- to answer "who did this and when" once more than one person holds admin
-- access.
--
-- admin_actions has no client-facing RLS policies at all (enabled, zero
-- policies = deny-all for anon/authenticated). Every write goes through a
-- SECURITY DEFINER function or the service-role admin-users Edge Function;
-- every read goes through admin_list_audit_log(), which checks is_admin
-- itself — same shape as every other admin surface since 0012.
-- =============================================================================

create table admin_actions (
  id          uuid primary key default gen_random_uuid(),
  -- set null rather than cascade: an admin who is later demoted and then
  -- deleted as an ordinary account should not take their history with them.
  admin_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  -- Deliberately no FK — this points at whichever table `action` implies
  -- (a user, a listing, a book, a report), so it can't reference one table.
  target_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index admin_actions_created_idx on admin_actions (created_at desc);

alter table admin_actions enable row level security;

-- Internal helper, not grantable — every SECURITY DEFINER function below
-- calls this from inside its own body, which runs as the function owner,
-- not the original caller, so no explicit grant is needed for that to work.
create or replace function log_admin_action(p_action text, p_target_id uuid, p_details jsonb default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into admin_actions (admin_id, action, target_id, details)
  values (auth.uid(), p_action, p_target_id, p_details);
$$;

revoke all on function log_admin_action(text, uuid, jsonb) from public;

-- -----------------------------------------------------------------------------
-- Read side — the panel's Audit Log tab.
-- -----------------------------------------------------------------------------

create or replace function admin_list_audit_log(p_limit int default 100, p_offset int default 0)
returns table (
  id          uuid,
  admin_id    uuid,
  admin_name  text,
  action      text,
  target_id   uuid,
  details     jsonb,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.admin_id, p.display_name, a.action, a.target_id, a.details, a.created_at
  from admin_actions a
  left join profiles p on p.id = a.admin_id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
$$;

revoke all on function admin_list_audit_log(int, int) from public;
grant execute on function admin_list_audit_log(int, int) to authenticated;

-- -----------------------------------------------------------------------------
-- Retrofitting logging into every existing mutating admin function.
-- create or replace keeps each function's identity (and its grants) intact —
-- same pattern 0011 used to fix profile_stats without editing 0002 by hand.
-- -----------------------------------------------------------------------------

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
  perform log_admin_action('resolve_report', p_report_id, null);
end;
$$;

create or replace function admin_set_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not p_is_admin and p_user_id = auth.uid()
     and (select count(*) from profiles where is_admin) <= 1 then
    raise exception 'cannot remove the last remaining admin' using errcode = '23514';
  end if;

  update profiles set is_admin = p_is_admin where id = p_user_id;
  perform log_admin_action(case when p_is_admin then 'promote_admin' else 'demote_admin' end, p_user_id, null);
end;
$$;

create or replace function admin_unlist(p_user_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update user_books set availability_type = 'private' where id = p_user_book_id;
  perform log_admin_action('unlist_listing', p_user_book_id, null);
end;
$$;

create or replace function admin_update_book(
  p_book_id           uuid,
  p_title             text,
  p_subtitle          text,
  p_authors           text[],
  p_publisher         text,
  p_publication_year  int,
  p_language          text,
  p_cover_url         text,
  p_description       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update books set
    title             = p_title,
    subtitle          = p_subtitle,
    authors           = p_authors,
    publisher         = p_publisher,
    publication_year  = p_publication_year,
    language          = p_language,
    cover_url         = p_cover_url,
    description       = p_description
  where id = p_book_id;

  perform log_admin_action('update_book', p_book_id, jsonb_build_object('title', p_title));
end;
$$;

create or replace function admin_delete_book(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from books where id = p_book_id;
  perform log_admin_action('delete_book', p_book_id, null);
exception
  when foreign_key_violation then
    raise exception 'still on at least one user''s shelf — remove it from every library first'
      using errcode = '23503';
end;
$$;
