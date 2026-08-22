\set ON_ERROR_STOP on
\pset pager off

-- Runs after rls_test.sql in the same session (see run.sh) — get back to an
-- unrestricted role before seeding, since that script leaves the session as
-- `authenticated`/bob.
reset role;

-- alice: admin. bob: regular user with a listing. carol: regular user.
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'admin-alice@example.com'),
  ('b2222222-2222-2222-2222-222222222222', 'bob2@example.com'),
  ('c3333333-3333-3333-3333-333333333333', 'carol@example.com');

update profiles set is_admin = true where id = 'a1111111-1111-1111-1111-111111111111';

insert into books (id, title, authors, language, created_by)
values ('e1111111-0000-0000-0000-000000000001', 'Some Catalog Book', array['Original Author'],
        'en', 'b2222222-2222-2222-2222-222222222222');

insert into user_books (id, user_id, book_id, availability_type, sale_price)
values ('f1111111-0000-0000-0000-000000000001',
        'b2222222-2222-2222-2222-222222222222',
        'e1111111-0000-0000-0000-000000000001',
        'sale', 50000);

-- ---------------------------------------------------------------------------
-- As bob (not an admin)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'b2222222-2222-2222-2222-222222222222';

\echo '### non-admin admin_stats (expect 0 rows)'
select count(*) from admin_stats();

\echo '### non-admin admin_list_users (expect 0 rows)'
select count(*) from admin_list_users();

\echo '### non-admin admin_list_listings (expect 0 rows)'
select count(*) from admin_list_listings();

\set ON_ERROR_STOP off
\echo '### non-admin admin_set_admin (expect error)'
select admin_set_admin('b2222222-2222-2222-2222-222222222222', true);

\echo '### non-admin admin_unlist (expect error)'
select admin_unlist('f1111111-0000-0000-0000-000000000001');

\echo '### non-admin admin_update_book (expect error)'
select admin_update_book('e1111111-0000-0000-0000-000000000001', 'Hijacked Title',
  null, array['Nobody'], null, null, null, null, null);

\echo '### non-admin admin_delete_book (expect error)'
select admin_delete_book('e1111111-0000-0000-0000-000000000001');
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- As alice (admin)
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

\echo '### admin_stats sees at least 3 users and 1 open listing'
select total_users >= 3, total_listings >= 1 from admin_stats();

\echo '### admin_list_users finds bob by email search (expect 1)'
select count(*) from admin_list_users('bob2@example.com');

\echo '### admin_list_listings finds bob''s sale listing (expect 1)'
select count(*) from admin_list_listings('Some Catalog Book');

-- profiles' own RLS is owner-only (0003_rls.sql) — even alice-as-admin can't
-- read carol's row directly, so is_admin here is verified through the same
-- admin RPC the panel itself would use, not a raw table read.
\echo '### promote carol to admin, then demote her back (expect t, then 0 rows)'
select admin_set_admin('c3333333-3333-3333-3333-333333333333', true);
select is_admin from admin_list_users('carol@example.com');
select admin_set_admin('c3333333-3333-3333-3333-333333333333', false);
select count(*) from admin_list_users('carol@example.com') where is_admin;

\echo '### demoting the last remaining admin is rejected (expect error)'
\set ON_ERROR_STOP off
select admin_set_admin('a1111111-1111-1111-1111-111111111111', false);
\set ON_ERROR_STOP on

-- user_books is owner-only too (alice can only take it off the *public*
-- listings view via the RPC, not read/write bob's row directly), so this is
-- verified via admin_list_listings rather than a raw table read.
\echo '### admin_unlist takes bob''s copy off discovery (expect 1, then 0)'
select count(*) from admin_list_listings('Some Catalog Book');
select admin_unlist('f1111111-0000-0000-0000-000000000001');
select count(*) from admin_list_listings('Some Catalog Book');

\echo '### admin_update_book overrides a catalog entry bob created (expect Corrected Title)'
select admin_update_book('e1111111-0000-0000-0000-000000000001', 'Corrected Title',
  null, array['Fixed Author'], null, null, null, null, null);
select title, authors from books where id = 'e1111111-0000-0000-0000-000000000001';

\echo '### admin_delete_book blocked while still on bob''s shelf (expect clear error, not raw FK)'
\set ON_ERROR_STOP off
select admin_delete_book('e1111111-0000-0000-0000-000000000001');
\set ON_ERROR_STOP on

-- Back to an unrestricted role for this cleanup delete — bob's own row,
-- which alice (correctly) cannot delete directly under her own RLS session.
reset role;
delete from user_books where id = 'f1111111-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

\echo '### admin_delete_book succeeds once nobody references it (expect 0 rows left)'
select admin_delete_book('e1111111-0000-0000-0000-000000000001');
select count(*) from books where id = 'e1111111-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Audit log — every mutating action above should have left a row.
-- ---------------------------------------------------------------------------

\echo '### admin_list_audit_log sees this session''s actions (expect t for each)'
select
  count(*) filter (where action = 'promote_admin' and target_id = 'c3333333-3333-3333-3333-333333333333') = 1,
  count(*) filter (where action = 'demote_admin' and target_id = 'c3333333-3333-3333-3333-333333333333') = 1,
  count(*) filter (where action = 'unlist_listing' and target_id = 'f1111111-0000-0000-0000-000000000001') = 1,
  count(*) filter (where action = 'update_book' and target_id = 'e1111111-0000-0000-0000-000000000001') = 1,
  count(*) filter (where action = 'delete_book' and target_id = 'e1111111-0000-0000-0000-000000000001') = 1,
  bool_and(admin_id = 'a1111111-1111-1111-1111-111111111111' and admin_name is not null)
from admin_list_audit_log();

set request.jwt.claim.sub = 'b2222222-2222-2222-2222-222222222222';
\echo '### non-admin admin_list_audit_log (expect 0 rows)'
select count(*) from admin_list_audit_log();
