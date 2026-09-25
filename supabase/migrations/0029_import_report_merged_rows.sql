-- =============================================================================
-- 0029_import_report_merged_rows.sql — tell the client when an import row
-- reused an existing copy instead of creating a new one
--
-- import_library_rows() (0023_bulk_import.sql) already deduped same-title-
-- and-author rows within one import call — that's what stops re-running an
-- import, or a file with a repeated title, from creating duplicate copies.
-- What it never reported back was WHICH rows that happened to: the
-- per-row result only ever carried {idx, error, categoryWarning}, so a
-- row that got silently merged into an earlier one looked identical to a
-- row that created its own new copy — both just "no error". A real import
-- (566 rows, one title logged twice with different dates) surfaced this as
-- a user-visible mismatch: the summary screen said "565 imported" but the
-- library only gained 564 books, with nothing explaining the gap.
--
-- Adding a `merged` flag to each row's result (true when it reused an
-- existing key rather than inserting a new book+copy) lets import.tsx
-- count "new copies" and "merged into an already-processed row" separately
-- and say so, instead of reporting a plain "imported" count that can't be
-- reconciled against the library's actual size afterward.
-- =============================================================================

create or replace function import_library_rows(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_row          jsonb;
  v_idx          int := 0;
  v_title        text;
  v_authors      text[];
  v_key          text;
  v_book_id      uuid;
  v_user_book_id uuid;
  v_is_new       boolean;
  v_status       reading_status;
  v_start_date   date;
  v_end_date     date;
  v_rating       int;
  v_review       text;
  v_pages        int;
  v_publisher    text;
  v_collections  text[];
  v_category_id  text;
  v_category_name text;
  v_row_error    text;
  v_category_warning text;
  v_results      jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Within-call dedupe map, seeded from what this user already has so a
  -- title also present in an earlier batch of the same import (already
  -- committed by the time this call runs — batches are awaited in order by
  -- the client) is reused instead of duplicated, and re-running an import
  -- doesn't create duplicate copies either. Same key shape import.tsx used
  -- to build client-side: lower(title)|lower(authors joined by comma).
  create temporary table if not exists _import_keys (
    key           text primary key,
    book_id       uuid not null,
    user_book_id  uuid not null
  ) on commit drop;

  insert into _import_keys (key, book_id, user_book_id)
  select lower(b.title) || '|' || lower(array_to_string(b.authors, ',')), ub.book_id, ub.id
  from user_books ub
  join books b on b.id = ub.book_id
  where ub.user_id = v_uid
  on conflict (key) do nothing;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_row_error := null;
    v_category_warning := null;

    begin
      v_title := btrim(coalesce(v_row->>'title', ''));
      if v_title = '' then
        raise exception 'missing title';
      end if;

      select coalesce(array_agg(value), '{}')
      into v_authors
      from jsonb_array_elements_text(coalesce(v_row->'authors', '[]'::jsonb));

      v_key := lower(v_title) || '|' || lower(array_to_string(v_authors, ','));

      select ik.book_id, ik.user_book_id into v_book_id, v_user_book_id
      from _import_keys ik where ik.key = v_key;

      v_is_new := v_book_id is null;
      v_pages := nullif(v_row->>'pages', '')::int;

      if v_is_new then
        v_publisher := nullif(btrim(coalesce(v_row->>'publisher', '')), '');

        insert into books (title, authors, publisher, page_count, created_by)
        values (v_title, v_authors, v_publisher, v_pages, v_uid)
        returning id into v_book_id;

        insert into user_books (user_id, book_id, total_pages)
        values (v_uid, v_book_id, v_pages)
        returning id into v_user_book_id;

        insert into _import_keys (key, book_id, user_book_id)
        values (v_key, v_book_id, v_user_book_id)
        on conflict (key) do nothing;
      end if;

      -- Client already normalized this to one of the three enum values
      -- (import.tsx's inferStatus) before it ever reaches here.
      v_status := coalesce(nullif(v_row->>'status', ''), 'want_to_read')::reading_status;
      v_start_date := nullif(v_row->>'startDate', '')::date;
      v_end_date := nullif(v_row->>'endDate', '')::date;
      v_rating := nullif(v_row->>'rating', '')::int;
      v_review := nullif(btrim(coalesce(v_row->>'review', '')), '');

      -- rating/review/date_finished are only valid once finished
      -- (review_requires_finished, 0020_reading_progress.sql) — same rule
      -- importRow() applied client-side before this migration.
      insert into reading_progress (
        user_book_id, user_id, reading_status, date_started, date_finished, rating, review
      )
      values (
        v_user_book_id, v_uid, v_status, v_start_date,
        case when v_status = 'finished' then v_end_date else null end,
        case when v_status = 'finished' then v_rating else null end,
        case when v_status = 'finished' then v_review else null end
      )
      on conflict (user_book_id, user_id) do update set
        reading_status = excluded.reading_status,
        date_started   = excluded.date_started,
        date_finished  = excluded.date_finished,
        rating         = excluded.rating,
        review         = excluded.review;

      -- Categories are secondary to getting the book into the library —
      -- same reasoning as the importRow() this replaces: a failure here
      -- must not discard a book whose title/dates/rating already saved.
      -- Nested block so only this part's exception is caught, leaving the
      -- book/copy/progress writes above intact either way.
      begin
        select coalesce(array_agg(btrim(value)) filter (where btrim(value) <> ''), '{}')
        into v_collections
        from jsonb_array_elements_text(coalesce(v_row->'collections', '[]'::jsonb));

        foreach v_category_name in array v_collections loop
          v_category_id := find_or_create_category(v_category_name);
          insert into book_categories (book_id, category_id)
          values (v_book_id, v_category_id)
          on conflict (book_id, category_id) do nothing;
        end loop;
      exception when others then
        v_category_warning := sqlerrm;
      end;
    exception when others then
      v_row_error := sqlerrm;
    end;

    v_results := v_results || jsonb_build_object(
      'idx', v_idx,
      'error', v_row_error,
      'categoryWarning', v_category_warning,
      'merged', (v_row_error is null) and not v_is_new
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function import_library_rows(jsonb) from public;
grant execute on function import_library_rows(jsonb) to authenticated;
