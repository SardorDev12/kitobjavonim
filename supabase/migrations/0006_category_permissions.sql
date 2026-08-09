-- =============================================================================
-- 0006_category_permissions.sql — who may classify a book
--
-- Categories hang off the canonical `books` record rather than off a copy,
-- which is deliberate: genre is a property of the book, so the second person to
-- catalogue "Atomic Habits" inherits the classification the first person set,
-- and the discovery filter works across everyone's listings.
--
-- The open question that leaves is who gets to write them. 0003 allowed any
-- signed-in user to tag any book, which is drive-by vandalism waiting to happen
-- on a shared record. This narrows it to people who actually own a copy — they
-- have the book in their hands, and they are the ones whose listings the
-- classification affects.
--
-- Safe to run whether or not 0003 has already been applied.
-- =============================================================================

drop policy if exists "signed-in users can categorise books" on book_categories;
drop policy if exists "owners can categorise their books" on book_categories;
drop policy if exists "owners can reclassify their books" on book_categories;

-- The subquery reads the caller's *own* user_books rows, which their own SELECT
-- policy already exposes — so unlike the photo policy in 0003 this needs no
-- SECURITY DEFINER helper to see what it is checking.
create policy "owners can categorise their books"
  on book_categories for insert
  to authenticated
  with check (
    exists (
      select 1 from user_books ub
      where ub.book_id = book_categories.book_id
        and ub.user_id = auth.uid()
    )
  );

create policy "owners can reclassify their books"
  on book_categories for delete
  to authenticated
  using (
    exists (
      select 1 from user_books ub
      where ub.book_id = book_categories.book_id
        and ub.user_id = auth.uid()
    )
  );

grant delete on book_categories to authenticated;
