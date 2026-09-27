-- =============================================================================
-- 0035_rename_children_category.sql — "Bolalar adabiyoti" shortens to just
-- "Bolalar", matching the other four categories' one-word style.
-- =============================================================================

update categories set name_uz = 'Bolalar' where id = 'children';
