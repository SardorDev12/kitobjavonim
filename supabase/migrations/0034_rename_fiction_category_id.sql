-- =============================================================================
-- 0034_rename_fiction_category_id.sql — purely cosmetic: 'fiction-uz' was
-- the merged Badiiy category's id only because it started life as one of
-- the two categories 0032 merged (Badiiy - O'zbek / Badiiy - Jahon) and
-- reusing it avoided moving tags twice. Now that the merge is settled,
-- 'fiction' reads better in the raw data — never shown to users either
-- way, this changes nothing but the primary key string itself.
--
-- Ordering matters: book_categories.category_id has a not-null FK to
-- categories(id), so the new row must exist before anything is repointed
-- to it, and categories_builtin_name_lower_idx (unique on lower(name_uz))
-- means the new row can't carry "Badiiy" yet while the old one still
-- does — it's inserted under a placeholder name, only renamed once the
-- old row holding that name is gone.
-- =============================================================================

do $$
declare
  v_name_uz     text;
  v_name_ru     text;
  v_name_en     text;
  v_sort_order  int;
begin
  select name_uz, name_ru, name_en, sort_order
  into v_name_uz, v_name_ru, v_name_en, v_sort_order
  from categories where id = 'fiction-uz';

  insert into categories (id, name_uz, name_ru, name_en, sort_order)
  values ('fiction', '__tmp_fiction_rename__', v_name_ru, v_name_en, v_sort_order);

  update book_categories set category_id = 'fiction' where category_id = 'fiction-uz';

  delete from categories where id = 'fiction-uz';

  update categories set name_uz = v_name_uz where id = 'fiction';
end $$;
