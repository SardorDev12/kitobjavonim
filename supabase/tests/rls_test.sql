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

insert into user_books (id, user_id, book_id, bookshelf_position_id, reading_status,
                        rating, review, condition, availability_type, sale_price)
values ('dddddddd-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000001',
        'finished', 5, 'SECRET PRIVATE REVIEW', 'good', 'sale', 85000);

\echo '### listed_at populated by trigger (expect t)'
select listed_at is not null from user_books where id = 'dddddddd-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- As Bob (authenticated)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

\echo '### bob reading user_books directly (expect 0 — alice''s review must not leak)'
select count(*) from user_books;

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
values ('aaaaaaaa-0000-0000-0000-000000000001', 'business');
\set ON_ERROR_STOP on

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '### alice (owns a copy) categorising it (expect success)'
insert into book_categories (book_id, category_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'business');

\echo '### category now visible on the listing (expect {business})'
select category_ids from listings where id = 'dddddddd-0000-0000-0000-000000000001';

\echo '### alice can remove her classification (expect 0 left)'
delete from book_categories
 where book_id = 'aaaaaaaa-0000-0000-0000-000000000001' and category_id = 'business';
select count(*) from book_categories;

reset role;

-- ---------------------------------------------------------------------------
-- Constraint checks
-- ---------------------------------------------------------------------------
\echo '### sale without price rejected (expect error)'
\set ON_ERROR_STOP off
insert into user_books (user_id, book_id, availability_type)
values ('11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'sale');

\echo '### review on an unfinished book rejected (expect error)'
insert into user_books (user_id, book_id, reading_status, rating)
values ('11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'reading', 4);

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

\echo '### profile_stats (expect 1 book, 1 for sale)'
select total_books, finished_books, exchange_count, sale_count
  from profile_stats where user_id = '11111111-1111-1111-1111-111111111111';

\echo '### reference data seeded'
select
  (select count(*) from locations where level = 'region')   as regions,
  (select count(*) from locations where level = 'district') as districts,
  (select count(*) from categories)                          as categories;
