\set ON_ERROR_STOP on
\pset pager off

-- Runs after households_test.sql in the same run.sh sequence — fresh
-- connection, same persistent database, so ids here avoid every earlier
-- file's namespace.
reset role;

insert into auth.users (id, email) values
  ('99999999-9999-9999-9999-999999999999', 'authortest@example.com');

insert into books (id, title, authors, source, created_by) values
  ('90000000-0000-0000-0000-000000000001', 'Book One', array['Chingiz Aytmatov'],
   'manual', '99999999-9999-9999-9999-999999999999'),
  ('90000000-0000-0000-0000-000000000002', 'Book Two', array['Chingiz Aytmatov', 'Erkin Vohidov'],
   'manual', '99999999-9999-9999-9999-999999999999'),
  ('90000000-0000-0000-0000-000000000003', 'Book Three', array['J.K. Rowling'],
   'manual', '99999999-9999-9999-9999-999999999999');

\echo '### matches, and dedupes across the two books that share an author (expect 1 row)'
select * from search_authors('ching');

\echo '### case-insensitive (expect 1 row)'
select * from search_authors('CHINGIZ');

\echo '### matches mid-string, not just a prefix (expect 1 row: J.K. Rowling)'
select * from search_authors('rowling');

\echo '### below the 2-char floor is rejected outright, not just unmatched (expect 0 rows)'
select * from search_authors('c');

\echo '### a null query does not error (expect 0 rows)'
select * from search_authors(null);

\echo '### no match (expect 0 rows)'
select * from search_authors('zzz_nomatch');

\echo '### books is public, so even an anonymous visitor can call this (expect 1 row)'
set role anon;
select * from search_authors('vohidov');
reset role;
