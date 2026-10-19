-- =============================================================================
-- 0041_admin_books_by_owner.sql — filter the admin Books page by user
--
-- admin_list_books gains p_owner_id (null = every user's books) and returns
-- each copy's owner, so the Books page can show whose book it is and the
-- Users page can open "this user's books". Search also matches the owner's
-- name or email now, on top of title and author.
--
-- The return columns change, so the function is dropped and recreated (both
-- the 0031 and 0040 signatures, whichever exists). Run 0040 first if it
-- hasn't been run: this file only replaces admin_list_books.
-- =============================================================================

drop function if exists admin_list_books(text, int, int);
drop function if exists admin_list_books(text, int, int, text, text);

create function admin_list_books(
  p_search   text default null,
  p_limit    int  default 50,
  p_offset   int  default 0,
  p_filter   text default 'all',
  p_sort     text default 'title',
  p_owner_id uuid default null
)
returns table (
  id                uuid,
  title             text,
  subtitle          text,
  authors           text[],
  publisher         text,
  publication_year  int,
  language          text,
  cover_url         text,
  description       text,
  owner_id          uuid,
  owner_name        text,
  owner_email       text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ub.id, ub.title, ub.subtitle, ub.authors, ub.publisher, ub.publication_year,
    ub.language, ub.cover_url, ub.description,
    p.id, p.display_name, u.email::text
  from user_books ub
  join profiles p   on p.id = ub.user_id
  join auth.users u on u.id = ub.user_id
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
    and (p_owner_id is null or ub.user_id = p_owner_id)
    and (
      p_search is null or btrim(p_search) = ''
      or ub.title ilike '%' || p_search || '%'
      or array_to_string(ub.authors, ' ') ilike '%' || p_search || '%'
      or p.display_name ilike '%' || p_search || '%'
      or u.email ilike '%' || p_search || '%'
    )
    and case p_filter
      when 'no_cover'   then ub.cover_url is null or btrim(ub.cover_url) = ''
      when 'no_authors' then coalesce(cardinality(ub.authors), 0) = 0
      else true
    end
  order by
    case when p_sort = 'title_desc' then lower(ub.title) end desc nulls last,
    case when p_sort = 'newest'     then ub.date_added end desc,
    case when p_sort = 'oldest'     then ub.date_added end asc,
    case when p_sort = 'year_desc'  then ub.publication_year end desc nulls last,
    case when p_sort = 'year_asc'   then ub.publication_year end asc nulls last,
    lower(ub.title) asc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

revoke all on function admin_list_books(text, int, int, text, text, uuid) from public;
grant execute on function admin_list_books(text, int, int, text, text, uuid) to authenticated;

-- Make PostgREST pick up the new signatures straight away (Supabase normally
-- does this on its own after DDL; this is the documented manual nudge).
notify pgrst, 'reload schema';
