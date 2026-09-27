-- =============================================================================
-- 0032_prune_categories.sql — down to 5 fixed categories, no custom ones.
--
-- Badiiy - O'zbek / Badiiy - Jahon merge into a single "Badiiy" (reusing the
-- 'fiction-uz' id rather than introducing a new one, so existing tags only
-- move once, not twice). science/religion/family/children are unchanged.
-- Any other row still in the table (a pre-0022 built-in, or someone's own
-- custom category) is left alone here — the client (reference.ts's
-- APPROVED_CATEGORY_IDS) is what actually stops it from being offered, since
-- deleting it here would also silently strip tags off books that already
-- have it, which is a bigger, unasked-for step than just retiring the
-- feature going forward.
-- =============================================================================

insert into book_categories (user_book_id, category_id)
select user_book_id, 'fiction-uz' from book_categories where category_id = 'fiction-world'
on conflict (user_book_id, category_id) do nothing;

delete from book_categories where category_id = 'fiction-world';

update categories set
  name_uz    = 'Badiiy',
  name_ru    = 'Художественная',
  name_en    = 'Fiction',
  sort_order = 1
where id = 'fiction-uz';

update categories set sort_order = 2 where id = 'science';
update categories set sort_order = 3 where id = 'religion';
update categories set sort_order = 4 where id = 'family';
update categories set sort_order = 5 where id = 'children';

delete from categories where id = 'fiction-world';

-- No more "+ New" in CategoryPicker — closing off the RPC too rather than
-- leaving a client-inaccessible-but-still-callable capability around.
revoke execute on function find_or_create_category(text) from authenticated;
