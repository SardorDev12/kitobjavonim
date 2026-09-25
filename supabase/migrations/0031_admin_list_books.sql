-- =============================================================================
-- 0031_admin_list_books.sql — restores the admin panel's "browse every
-- book" page after 0030_merge_books_into_user_books.sql
--
-- admin/src/pages/BooksPage.tsx used to query `books` directly — safe
-- without an admin RPC because "books are public" (0003_rls.sql) let
-- anyone read the whole shared catalog. Now that catalog rows live on
-- user_books, that same query would only ever return the admin's own
-- books (RLS: "read own copies"), not everyone's. Same shape as
-- admin_list_listings, minus the availability filter — this page browses
-- every copy, not just listed ones.
-- =============================================================================

create or replace function admin_list_books(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
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
  description       text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ub.id, ub.title, ub.subtitle, ub.authors, ub.publisher, ub.publication_year,
    ub.language, ub.cover_url, ub.description
  from user_books ub
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
    and (
      p_search is null or btrim(p_search) = ''
      or ub.title ilike '%' || p_search || '%'
    )
  order by ub.title
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

revoke all on function admin_list_books(text, int, int) from public;
grant execute on function admin_list_books(text, int, int) to authenticated;
