-- Lets the add-book form suggest existing author spellings as someone types,
-- instead of every user re-typing (and inevitably re-spelling) the same
-- author independently. `books.authors` is a plain text[] with no separate
-- authors table — turning that into a fully normalized, foreign-keyed
-- author model is a much bigger schema change than this warrants; a search
-- function over the existing column gets the actual goal (nudge people
-- toward the spelling that's already in use) without it.
--
-- `books` is already publicly readable (0003_rls.sql: "books are public"),
-- so this needs no elevated privilege — security invoker (the default) is
-- enough, same as the app already does for the title-search equivalent
-- (useSimilarBooks's plain `.ilike()` query, no RPC needed there since a
-- single-column ILIKE is expressible directly; unnesting an array column
-- isn't, hence the function here).
create or replace function search_authors(query text)
returns table (name text)
language sql
stable
set search_path = public
as $$
  select distinct a
  from books, unnest(authors) as a
  where length(btrim(coalesce(query, ''))) >= 2
    and a ilike '%' || btrim(query) || '%'
  order by a
  limit 8;
$$;

grant execute on function search_authors(text) to anon, authenticated;
