\set ON_ERROR_STOP on
\pset pager off

-- Runs after admin_test.sql in the same run.sh sequence — fresh connection,
-- but same persistent database, so use ids that don't collide with the
-- earlier files' alice/bob/carol.
reset role;

-- dave creates a household, erin joins it, frank stays a stranger.
insert into auth.users (id, email) values
  ('d4444444-4444-4444-4444-444444444444', 'dave@example.com'),
  ('e5555555-5555-5555-5555-555555555555', 'erin@example.com'),
  ('f6666666-6666-6666-6666-666666666666', 'frank@example.com');

insert into books (id, title, authors, language, created_by)
values ('d0000000-0000-0000-0000-000000000001', 'Shared Household Book', array['Some Author'],
        'en', 'd4444444-4444-4444-4444-444444444444');

set role authenticated;
set request.jwt.claim.sub = 'd4444444-4444-4444-4444-444444444444';

\echo '### dave creates a household'
select create_household('Dave''s Place') is not null as created;

\echo '### dave is now the owner (expect owner)'
select role from household_members where user_id = 'd4444444-4444-4444-4444-444444444444';

\echo '### dave creating a second household is rejected (expect error)'
\set ON_ERROR_STOP off
select create_household('Second Household');
\set ON_ERROR_STOP on

-- Dave's own household id and invite code, for the rest of this file. The
-- code is captured here, as dave (who has RLS access to his own household)
-- — a joiner has no access to read a household's row before joining it, so
-- in real use this string travels out-of-band (Telegram, in person), never
-- fetched via a query of their own.
select id as dave_household, invite_code as dave_invite_code
  from households where created_by = 'd4444444-4444-4444-4444-444444444444' \gset

\echo '### dave adds a personal (unshared) shelf and book'
insert into bookshelves (id, user_id, name)
values ('d0000000-0000-0000-0000-000000000002', 'd4444444-4444-4444-4444-444444444444', 'Dave Personal Shelf');

insert into user_books (id, user_id, book_id)
values ('d0000000-0000-0000-0000-000000000003',
        'd4444444-4444-4444-4444-444444444444',
        'd0000000-0000-0000-0000-000000000001');

\echo '### dave adds a shared shelf + position'
insert into bookshelves (id, user_id, name, household_id)
values ('d0000000-0000-0000-0000-000000000004',
        'd4444444-4444-4444-4444-444444444444', 'Shared Living Room', :'dave_household');

insert into bookshelf_positions (id, bookshelf_id, shelf_number, row_number)
values ('d0000000-0000-0000-0000-000000000005',
        'd0000000-0000-0000-0000-000000000004', 1, 1);

\echo '### dave adds a shared copy on that shelf'
insert into user_books (id, user_id, book_id, bookshelf_position_id, household_id)
values ('d0000000-0000-0000-0000-000000000006',
        'd4444444-4444-4444-4444-444444444444',
        'd0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000005',
        :'dave_household');

\echo '### library_entries shows household_id and added_by_name for the shared copy'
select household_id is not null as shared, added_by_name
  from library_entries where id = 'd0000000-0000-0000-0000-000000000006';

\echo '### dave marks his own copy reading (his own reading_progress row, 0020)'
insert into reading_progress (user_book_id, user_id, reading_status)
values ('d0000000-0000-0000-0000-000000000006', 'd4444444-4444-4444-4444-444444444444', 'reading');

reset role;

-- ---------------------------------------------------------------------------
-- Frank (stranger — not a member yet)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'f6666666-6666-6666-6666-666666666666';

\echo '### frank (not a member) sees none of dave''s bookshelves (expect 0)'
select count(*) from bookshelves;

\echo '### frank (not a member) sees none of dave''s books (expect 0)'
select count(*) from user_books;

\echo '### frank joins with dave''s invite code'
select join_household(:'dave_invite_code') is not null as joined;

\echo '### frank now sees the shared shelf, but not dave''s personal one (expect 1)'
select count(*) from bookshelves where household_id = :'dave_household';

\echo '### frank still cannot see dave''s personal shelf directly (expect 0)'
select count(*) from bookshelves where id = 'd0000000-0000-0000-0000-000000000002';

\echo '### frank joining a second time is rejected (expect error)'
\set ON_ERROR_STOP off
select join_household('anything');
\set ON_ERROR_STOP on

reset role;

-- ---------------------------------------------------------------------------
-- Erin joins, edits a shared copy, and cannot forge attribution
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'e5555555-5555-5555-5555-555555555555';

\echo '### an invalid invite code is rejected (expect error)'
\set ON_ERROR_STOP off
select join_household('NOTAREALCODE');
\set ON_ERROR_STOP on

\echo '### erin joins with dave''s invite code'
select join_household(:'dave_invite_code') is not null as joined;

\echo '### erin can place a new copy on the shared shelf (expect success)'
insert into user_books (id, user_id, book_id, bookshelf_position_id, household_id)
values ('d0000000-0000-0000-0000-000000000007',
        'e5555555-5555-5555-5555-555555555555',
        'd0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000005',
        :'dave_household');

\echo '### erin cannot see dave''s own reading_progress row on the shared copy (expect 0 — private per person, 0020)'
select count(*) from reading_progress where user_book_id = 'd0000000-0000-0000-0000-000000000006';

\echo '### erin creates her own reading_progress on dave''s shared copy (expect success)'
insert into reading_progress (user_book_id, user_id, reading_status)
values ('d0000000-0000-0000-0000-000000000006', 'e5555555-5555-5555-5555-555555555555', 'finished');

\echo '### erin sees her own status on the shared copy via library_entries (expect finished)'
select reading_status from library_entries where id = 'd0000000-0000-0000-0000-000000000006';

\echo '### erin cannot reassign a shared copy''s user_id to herself (expect error)'
\set ON_ERROR_STOP off
update user_books set user_id = 'e5555555-5555-5555-5555-555555555555'
where id = 'd0000000-0000-0000-0000-000000000006';
\set ON_ERROR_STOP on

-- The "share with household" toggle in the app is only enabled for a row's
-- own creator (src/app/book/[id].tsx, src/app/bookshelves/index.tsx) —
-- this is why: only dave, who added it, can actually un-share his own copy.
\echo '### erin cannot un-share dave''s copy — she didn''t add it (expect error)'
\set ON_ERROR_STOP off
update user_books set household_id = null
where id = 'd0000000-0000-0000-0000-000000000006';
\set ON_ERROR_STOP on

\echo '### the copy is still shared after erin''s attempt (expect t)'
select household_id is not null as still_shared
  from user_books where id = 'd0000000-0000-0000-0000-000000000006';

reset role;
set role authenticated;
set request.jwt.claim.sub = 'd4444444-4444-4444-4444-444444444444';

\echo '### dave''s own status on the same shared copy is untouched by erin''s (expect reading, not finished)'
select reading_status from library_entries where id = 'd0000000-0000-0000-0000-000000000006';

\echo '### dave (the creator) can un-share his own copy (expect success)'
update user_books set household_id = null
where id = 'd0000000-0000-0000-0000-000000000006';

\echo '### it''s private again, and dave still sees it via ownership (expect f, t)'
select household_id is not null as shared, user_id = 'd4444444-4444-4444-4444-444444444444' as owned_by_dave
  from user_books where id = 'd0000000-0000-0000-0000-000000000006';

reset role;
set role authenticated;
set request.jwt.claim.sub = 'e5555555-5555-5555-5555-555555555555';

\echo '### erin still cannot see dave''s personal (unshared) shelf (expect 0)'
select count(*) from bookshelves where id = 'd0000000-0000-0000-0000-000000000002';

reset role;

-- ---------------------------------------------------------------------------
-- Owner-only actions
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'e5555555-5555-5555-5555-555555555555';

\echo '### erin (member, not owner) cannot remove frank (expect error)'
\set ON_ERROR_STOP off
select remove_household_member('f6666666-6666-6666-6666-666666666666');
\set ON_ERROR_STOP on

\echo '### erin (member, not owner) cannot regenerate the invite code (expect error)'
\set ON_ERROR_STOP off
select regenerate_invite_code();
\set ON_ERROR_STOP on

reset role;
set role authenticated;
set request.jwt.claim.sub = 'd4444444-4444-4444-4444-444444444444';

\echo '### dave (owner) removes frank'
select remove_household_member('f6666666-6666-6666-6666-666666666666');

\echo '### household now has 2 members (expect 2)'
select count(*) from household_members where household_id = :'dave_household';

\echo '### dave regenerates the invite code'
select regenerate_invite_code() is not null as regenerated;

reset role;

\echo '### frank (removed) no longer sees the shared shelf (expect 0)'
set role authenticated;
set request.jwt.claim.sub = 'f6666666-6666-6666-6666-666666666666';
select count(*) from bookshelves where household_id = :'dave_household';
reset role;

-- ---------------------------------------------------------------------------
-- Ownership transfer on leave
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd4444444-4444-4444-4444-444444444444';

\echo '### dave (owner) leaves the household'
select leave_household();

reset role;

\echo '### erin is now the owner (expect owner)'
select role from household_members where user_id = 'e5555555-5555-5555-5555-555555555555';

\echo '### erin can now rename the household (expect success)'
set role authenticated;
set request.jwt.claim.sub = 'e5555555-5555-5555-5555-555555555555';
update households set name = 'Erin''s Place' where id = :'dave_household';
reset role;

-- user_id is immutable and always grants access (that's the point of it),
-- so dave still sees rows *he* created and shared, even after leaving — he
-- didn't stop being their creator. What he actually loses is access to
-- rows *other* members created, since that visibility came only from
-- household membership.
\echo '### dave (left) still sees his own shelf, since he created it (expect 1)'
set role authenticated;
set request.jwt.claim.sub = 'd4444444-4444-4444-4444-444444444444';
select count(*) from bookshelves where id = 'd0000000-0000-0000-0000-000000000004';

\echo '### dave (left) no longer sees erin''s shared copy (expect 0)'
select count(*) from user_books where id = 'd0000000-0000-0000-0000-000000000007';

\echo '### dave''s personal shelf is still his own (expect 1)'
select count(*) from bookshelves where id = 'd0000000-0000-0000-0000-000000000002';
reset role;

\echo '### erin, now the sole member, leaves — dissolving the household'
set role authenticated;
set request.jwt.claim.sub = 'e5555555-5555-5555-5555-555555555555';
select leave_household();
reset role;

\echo '### household is gone (expect 0)'
select count(*) from households where id = :'dave_household';

\echo '### the formerly-shared shelf survived, just un-shared (expect household_id is null)'
select household_id is null as unshared from bookshelves where id = 'd0000000-0000-0000-0000-000000000004';
