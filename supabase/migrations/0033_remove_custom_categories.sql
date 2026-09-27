-- =============================================================================
-- 0033_remove_custom_categories.sql — follow-up to 0032: actually remove
-- every category outside the fixed 5 (0022's original built-ins that
-- predated the 6-category set, and every private custom category anyone
-- created since 0026_private_custom_categories.sql), and the tags on
-- whatever books had them. 0032 deliberately left this data in place;
-- this migration is the explicit, asked-for step to take it out.
-- =============================================================================

delete from book_categories
where category_id not in ('fiction-uz', 'science', 'religion', 'family', 'children');

delete from categories
where id not in ('fiction-uz', 'science', 'religion', 'family', 'children');
