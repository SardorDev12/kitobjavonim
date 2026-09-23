-- =============================================================================
-- 0025_free_text_district.sql — district becomes free text, not a picker
--
-- profiles.region_id/district_id (0001_init.sql) are plain `text references
-- locations(id)` — not an enum, not a typed lookup — so a free-typed value
-- only needs to resolve to a real locations row to keep saving successfully.
-- Region stays a fixed 14-item Select (closed set, and every district needs
-- one as a parent); district becomes a TextField, resolved to a locations
-- row on save via find_or_create_district() below — same shape as
-- find_or_create_category() (0022_custom_categories.sql): case-insensitive
-- match against an existing name first, otherwise insert a new row
-- attributed to the caller. This keeps every existing district_id consumer
-- (discover's filters, the listings/public_profiles views, describe()'s
-- "Chilonzor, Tashkent City" label) working unchanged — a free-typed
-- district is still a real locations.id under the hood, just possibly a
-- freshly-minted one instead of one of the original 61 seeded rows.
-- =============================================================================

alter table locations
  add column created_by uuid references auth.users (id) on delete set null;

comment on column locations.created_by is
  'null = built-in/seeded location; set = a district created on the fly by this user via find_or_create_district().';

-- Case-insensitive dedup, scoped per region (unlike categories' global
-- uniqueness) — two different regions can each have their own district by
-- the same name without colliding, but the same region typing "chilonzor"
-- twice should land on one row both times.
create unique index locations_district_name_per_region_idx
  on locations (parent_id, lower(name_uz))
  where level = 'district';

-- -----------------------------------------------------------------------------
-- find_or_create_district — the only way a new district row is ever added
-- from the client. security definer because authenticated has no insert
-- grant on locations at all (0003_rls.sql: select-only); this function is
-- the sole, narrow exception, and only ever inserts a district (never a
-- region) attributed to the caller themselves.
-- -----------------------------------------------------------------------------

create or replace function find_or_create_district(p_name text, p_region_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   text;
  v_name text := btrim(p_name);
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if length(v_name) = 0 then
    raise exception 'name is required';
  end if;

  if not exists (select 1 from locations where id = p_region_id and level = 'region') then
    raise exception 'invalid region' using errcode = '23514';
  end if;

  select id into v_id from locations
  where level = 'district' and parent_id = p_region_id and lower(name_uz) = lower(v_name);
  if v_id is not null then
    return v_id;
  end if;

  insert into locations (id, parent_id, level, name_uz, name_ru, name_en, sort_order, created_by)
  values ('custom-' || gen_random_uuid()::text, p_region_id, 'district', v_name, v_name, v_name, 100, auth.uid())
  -- Another caller may have typed the same district in the same region
  -- between the select above and this insert; on conflict, hand back the
  -- row that won the race instead of failing the request over a duplicate
  -- that isn't really one.
  on conflict (parent_id, lower(name_uz)) where level = 'district'
  do update set name_uz = locations.name_uz
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function find_or_create_district(text, text) from public;
grant execute on function find_or_create_district(text, text) to authenticated;
