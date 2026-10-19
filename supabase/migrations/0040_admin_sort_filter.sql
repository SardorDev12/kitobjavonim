-- =============================================================================
-- 0040_admin_sort_filter.sql — sort and filter for the admin panel's lists
--
-- The Users, Listings, Books and Audit Log tabs page through results 50 (or
-- 100) rows at a time, so sorting or filtering in the browser would only ever
-- reorder the first page. These versions take the sort and filter as
-- parameters and apply them in SQL, before the limit.
--
-- Each function gains new trailing parameters with defaults that reproduce
-- the old behavior exactly. Changing a function's parameter list means a new
-- signature, so the old ones are dropped first — otherwise PostgREST could
-- match a call to either and refuse it as ambiguous.
--
-- Unknown sort/filter values fall back to the defaults rather than erroring.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Users
--   p_filter: all | admins | banned | regular
--   p_sort:   newest | oldest | name | books | listings
-- -----------------------------------------------------------------------------

drop function if exists admin_list_users(text, int, int);

create function admin_list_users(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0,
  p_filter text default 'all',
  p_sort   text default 'newest'
)
returns table (
  user_id       uuid,
  email         text,
  display_name  text,
  is_admin      boolean,
  is_banned     boolean,
  region_id     text,
  district_id   text,
  book_count    bigint,
  listing_count bigint,
  created_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      p.id as user_id,
      u.email::text as email,
      p.display_name,
      p.is_admin,
      (u.banned_until is not null and u.banned_until > now()) as is_banned,
      p.region_id,
      p.district_id,
      (select count(*) from user_books ub where ub.user_id = p.id) as book_count,
      (select count(*) from user_books ub
         where ub.user_id = p.id and ub.availability_type <> 'private') as listing_count,
      p.created_at
    from profiles p
    join auth.users u on u.id = p.id
    where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
      and (
        p_search is null or btrim(p_search) = ''
        or p.display_name ilike '%' || p_search || '%'
        or u.email ilike '%' || p_search || '%'
      )
  )
  select * from base
  where case p_filter
    when 'admins'  then is_admin
    when 'banned'  then is_banned
    when 'regular' then not is_admin and not is_banned
    else true
  end
  order by
    case when p_sort = 'name'     then lower(display_name) end asc nulls last,
    case when p_sort = 'books'    then book_count end desc nulls last,
    case when p_sort = 'listings' then listing_count end desc nulls last,
    case when p_sort = 'oldest'   then created_at end asc,
    created_at desc
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

revoke all on function admin_list_users(text, int, int, text, text) from public;
grant execute on function admin_list_users(text, int, int, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Listings
--   p_filter: all | exchange | sale | reported
--             (exchange and sale both include exchange_or_sale)
--   p_sort:   newest | oldest | title | price_desc | price_asc | reports
-- -----------------------------------------------------------------------------

drop function if exists admin_list_listings(text, int, int);

create function admin_list_listings(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0,
  p_filter text default 'all',
  p_sort   text default 'newest'
)
returns table (
  user_book_id       uuid,
  title              text,
  authors            text[],
  cover_url          text,
  availability_type  availability_type,
  sale_price         numeric,
  owner_id           uuid,
  owner_name         text,
  owner_email        text,
  listed_at          timestamptz,
  open_report_count  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      ub.id as user_book_id,
      ub.title,
      ub.authors,
      ub.cover_url,
      ub.availability_type,
      ub.sale_price,
      p.id as owner_id,
      p.display_name as owner_name,
      u.email::text as owner_email,
      ub.listed_at,
      (select count(*) from listing_reports r
         where r.user_book_id = ub.id and r.resolved_at is null) as open_report_count
    from user_books ub
    join profiles p    on p.id = ub.user_id
    join auth.users u  on u.id = p.id
    where ub.availability_type <> 'private'
      and exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
      and (
        p_search is null or btrim(p_search) = ''
        or ub.title ilike '%' || p_search || '%'
        or p.display_name ilike '%' || p_search || '%'
      )
  )
  select * from base
  where case p_filter
    when 'exchange' then availability_type in ('exchange', 'exchange_or_sale')
    when 'sale'     then availability_type in ('sale', 'exchange_or_sale')
    when 'reported' then open_report_count > 0
    else true
  end
  order by
    case when p_sort = 'title'      then lower(title) end asc nulls last,
    case when p_sort = 'price_desc' then sale_price end desc nulls last,
    case when p_sort = 'price_asc'  then sale_price end asc nulls last,
    case when p_sort = 'reports'    then open_report_count end desc nulls last,
    case when p_sort = 'oldest'     then listed_at end asc nulls last,
    listed_at desc nulls last
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

revoke all on function admin_list_listings(text, int, int, text, text) from public;
grant execute on function admin_list_listings(text, int, int, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Books (every copy in every library)
--   p_filter: all | no_cover | no_authors
--   p_sort:   title | title_desc | newest | oldest | year_desc | year_asc
--   Search now also matches authors, not only the title.
-- -----------------------------------------------------------------------------

drop function if exists admin_list_books(text, int, int);

create function admin_list_books(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0,
  p_filter text default 'all',
  p_sort   text default 'title'
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
      or array_to_string(ub.authors, ' ') ilike '%' || p_search || '%'
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

revoke all on function admin_list_books(text, int, int, text, text) from public;
grant execute on function admin_list_books(text, int, int, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Audit log
--   p_action: null for every action, or one action name (e.g. 'ban_user')
--   p_sort:   newest | oldest
-- -----------------------------------------------------------------------------

drop function if exists admin_list_audit_log(int, int);

create function admin_list_audit_log(
  p_limit  int  default 100,
  p_offset int  default 0,
  p_action text default null,
  p_sort   text default 'newest'
)
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
    and (p_action is null or btrim(p_action) = '' or a.action = p_action)
  order by
    case when p_sort = 'oldest' then a.created_at end asc,
    a.created_at desc
  limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
$$;

revoke all on function admin_list_audit_log(int, int, text, text) from public;
grant execute on function admin_list_audit_log(int, int, text, text) to authenticated;
