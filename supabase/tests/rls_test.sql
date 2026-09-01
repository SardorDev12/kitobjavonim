\set ON_ERROR_STOP on
\pset pager off

-- Two users: alice owns and lists a book, bob browses.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com');

\echo '### profiles auto-created by trigger (expect 2)'
select count(*) from profiles;

-- Alice's data, created as the table owner (setup, not under test).
update profiles set display_name = 'Alice', telegram_username = 'alice_uz',
       phone = '+998901234567', show_phone = true, region_id = 'tashkent-city',
       district_id = 'tc-chilonzor'
 where id = '11111111-1111-1111-1111-111111111111';

insert into books (id, title, authors, isbn13, language, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Atomic Habits', array['James Clear'],
        '9780735211292', 'en', '11111111-1111-1111-1111-111111111111');

insert into bookshelves (id, user_id, name)
values ('bbbbbbbb-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 'Living Room');

insert into bookshelf_positions (id, bookshelf_id, shelf_number, row_number)
values ('cccccccc-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001', 1, 1);

\echo '### position user_id backfilled from bookshelf (expect alice)'
select user_id from bookshelf_positions where id = 'cccccccc-0000-0000-0000-000000000001';

insert into user_books (id, user_id, book_id, bookshelf_position_id, condition, availability_type, sale_price)
values ('dddddddd-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000001',
        'good', 'sale', 85000);

-- reading_status/rating/review live in reading_progress now (0020), keyed
-- per person rather than per copy.
insert into reading_progress (user_book_id, user_id, reading_status, rating, review)
values ('dddddddd-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'finished', 5, 'SECRET PRIVATE REVIEW');

\echo '### listed_at populated by trigger (expect t)'
select listed_at is not null from user_books where id = 'dddddddd-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- As Bob (authenticated)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

\echo '### bob reading user_books directly (expect 0 — alice''s copy must not leak)'
select count(*) from user_books;

\echo '### bob reading reading_progress directly (expect 0 — alice''s review must not leak)'
select count(*) from reading_progress;

\echo '### bob reading listings view (expect 1)'
select count(*) from listings;

\echo '### listings view has no review/rating/notes columns (expect 0)'
select count(*) from information_schema.columns
 where table_name = 'listings' and column_name in ('review', 'rating', 'notes');

\echo '### listings carries no contact details (expect 0)'
select count(*) from information_schema.columns
 where table_name = 'listings' and column_name in ('owner_phone', 'owner_telegram_username');

\echo '### bob reading alice''s profile row directly (expect 0)'
select count(*) from profiles where id = '11111111-1111-1111-1111-111111111111';

\echo '### bob via public_profiles (expect Alice, phone shown because show_phone)'
select display_name, telegram_username, phone from public_profiles
 where id = '11111111-1111-1111-1111-111111111111';

\echo '### bob cannot see alice''s bookshelves (expect 0)'
select count(*) from bookshelves;

\echo '### request_contact returns details and logs the tap'
select * from request_contact('dddddddd-0000-0000-0000-000000000001', 'telegram', 'Is it still available?');

\echo '### contact_requests now has bob''s row (expect 1)'
select count(*) from contact_requests;

reset role;

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';

\echo '### anon browsing listings (expect 1 — discovery works logged out)'
select count(*) from listings;

\echo '### anon reading user_books (expect permission denied)'
\set ON_ERROR_STOP off
select count(*) from user_books;
\set ON_ERROR_STOP on

\echo '### anon calling request_contact (expect permission denied)'
\set ON_ERROR_STOP off
select * from request_contact('dddddddd-0000-0000-0000-000000000001', 'phone');
\set ON_ERROR_STOP on

reset role;

-- ---------------------------------------------------------------------------
-- Categories: only someone who owns a copy may classify a shared book
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

\echo '### bob (owns no copy) categorising alice''s book (expect error)'
\set ON_ERROR_STOP off
insert into book_categories (book_id, category_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'family');
\set ON_ERROR_STOP on

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '### alice (owns a copy) categorising it (expect success)'
insert into book_categories (book_id, category_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'family');

\echo '### category now visible on the listing (expect {family})'
select category_ids from listings where id = 'dddddddd-0000-0000-0000-000000000001';

\echo '### alice can remove her classification — a built-in category is a real, shared delete (expect 0 left)'
delete from book_categories
 where book_id = 'aaaaaaaa-0000-0000-0000-000000000001' and category_id = 'family';
select count(*) from book_categories;

reset role;

-- ---------------------------------------------------------------------------
-- Custom categories: find_or_create_category() and book_category_hidden
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '### alice creates a custom category (expect a custom-* id)'
select find_or_create_category('  Sci-Fi  ') as scifi_id \gset

\echo '### bob typing the same name in different case reuses alice''s row, not a duplicate (expect true)'
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select find_or_create_category('sci-fi') = :'scifi_id' as same_id;

\echo '### exactly one custom category exists after both calls (expect 1)'
select count(*) from categories where created_by is not null;

\echo '### bob attaches the custom category to alice''s book he now shares no copy of (expect error — same ownership rule as built-ins)'
\set ON_ERROR_STOP off
insert into book_categories (book_id, category_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'scifi_id');
\set ON_ERROR_STOP on

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into book_categories (book_id, category_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'scifi_id');

\echo '### alice hides the custom category for herself (expect success)'
insert into book_category_hidden (book_id, category_id, user_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'scifi_id', '11111111-1111-1111-1111-111111111111');

\echo '### alice cannot hide it on bob''s behalf (expect error)'
\set ON_ERROR_STOP off
insert into book_category_hidden (book_id, category_id, user_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', :'scifi_id', '22222222-2222-2222-2222-222222222222');
\set ON_ERROR_STOP on

\echo '### the underlying shared tag is untouched by alice''s personal hide (expect 1)'
select count(*) from book_categories where category_id = :'scifi_id';

\echo '### alice can unhide her own row (expect 0 left)'
delete from book_category_hidden
 where book_id = 'aaaaaaaa-0000-0000-0000-000000000001'
   and category_id = :'scifi_id'
   and user_id = '11111111-1111-1111-1111-111111111111';
select count(*) from book_category_hidden;

reset role;

-- ---------------------------------------------------------------------------
-- Constraint checks
-- ---------------------------------------------------------------------------
\echo '### sale without price rejected (expect error)'
\set ON_ERROR_STOP off
insert into user_books (user_id, book_id, availability_type)
values ('11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'sale');

\echo '### a second copy for alice, with no reading_progress row yet'
insert into user_books (id, user_id, book_id)
values ('dddddddd-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001');

\echo '### review on an unfinished reading_progress row rejected (expect error)'
insert into reading_progress (user_book_id, user_id, reading_status, rating)
values ('dddddddd-0000-0000-0000-000000000002',
        '11111111-1111-1111-1111-111111111111', 'reading', 4);

\echo '### placing a book on someone else''s shelf rejected (expect error)'
insert into user_books (user_id, book_id, bookshelf_position_id)
values ('22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000001');

\echo '### self-contact rejected (expect error)'
insert into contact_requests (user_book_id, from_user_id, to_user_id, channel)
values ('dddddddd-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111', 'phone');
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
\echo '### full-text search finds the book (expect 1)'
select count(*) from books where search_vector @@ websearch_to_tsquery('simple', 'atomic habits');

\echo '### author search via trigram (expect 1)'
select count(*) from books where authors_text(authors) ilike '%clear%';

-- 2 copies now: dddddddd-...-001 (finished, for sale) and -002 (added
-- above for the constraint check — its reading_progress insert failed,
-- so it has no row and falls back to "unread" via profile_stats' own
-- coalesce, same as library_entries does).
\echo '### profile_stats (expect 2 books, 1 finished, 1 unread, 1 for sale)'
select total_books, finished_books, unread_books, exchange_count, sale_count
  from profile_stats where user_id = '11111111-1111-1111-1111-111111111111';

\echo '### reference data seeded'
select
  (select count(*) from locations where level = 'region')   as regions,
  (select count(*) from locations where level = 'district') as districts,
  (select count(*) from categories)                          as categories;
