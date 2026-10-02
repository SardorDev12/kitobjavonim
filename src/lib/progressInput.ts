/**
 * Keeps the progress sheet's two fields in step: "pages read today" (a delta
 * from the page already saved) and "current page" (the absolute page). Both
 * work on the raw text of their inputs, so a half-typed or empty field never
 * turns into a surprise number.
 */

function parseCount(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}

/** The current-page text after the user types `readText` pages read today. */
export function pageFromRead(savedPage: number, readText: string, total: number): string {
  const read = parseCount(readText);
  if (read === null) return savedPage > 0 ? String(savedPage) : '';
  const page = savedPage + read;
  return String(total > 0 ? Math.min(page, total) : page);
}

/**
 * The pages-read-today text after the user types `pageText` as the current
 * page. Empty when that page is at or before the saved one — a lower page is
 * a correction, not reading.
 */
export function readFromPage(savedPage: number, pageText: string): string {
  const page = parseCount(pageText);
  if (page === null || page <= savedPage) return '';
  return String(page - savedPage);
}
