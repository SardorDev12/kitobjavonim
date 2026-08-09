import { normalizeIsbn } from '@/lib/format';
import type { MetadataSource } from '@/types/database';

/**
 * Book metadata lookup.
 *
 * Two free providers, queried in order: Google Books first for its better
 * coverage and thumbnails, Open Library as a fallback. Neither requires an API
 * key at the volumes this app will do.
 *
 * A caveat worth knowing rather than discovering later: coverage of books
 * published in Uzbekistan, and of Uzbek- and Russian-language editions
 * generally, is poor in both catalogues. Manual entry is not an edge case here —
 * it is a routine path, which is why `add/manual` is a first-class screen rather
 * than a buried fallback.
 */

export type BookCandidate = {
  /** Stable key for list rendering; not a database id. */
  key: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn13: string | null;
  isbn10: string | null;
  publisher: string | null;
  publication_year: number | null;
  language: string | null;
  cover_url: string | null;
  page_count: number | null;
  description: string | null;
  source: MetadataSource;
  source_id: string | null;
};

const GOOGLE_BOOKS = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY = 'https://openlibrary.org';

/** Providers can be slow or down; a hung request would block the add flow. */
const TIMEOUT_MS = 8000;

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // A failed lookup must never be fatal — the user can still enter the book
    // by hand, and that path is always offered alongside the results.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------------------------------------------------------
// Google Books
// -----------------------------------------------------------------------------

type GoogleVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    language?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
};

function fromGoogle(volume: GoogleVolume): BookCandidate | null {
  const info = volume.volumeInfo;
  if (!info?.title) return null;

  const identifiers = info.industryIdentifiers ?? [];
  const isbn13 = identifiers.find((id) => id.type === 'ISBN_13')?.identifier ?? null;
  const isbn10 = identifiers.find((id) => id.type === 'ISBN_10')?.identifier ?? null;

  // Google serves thumbnails over plain HTTP and at a low zoom level by default.
  const rawCover = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null;
  const cover = rawCover ? rawCover.replace(/^http:/, 'https:').replace(/&edge=curl/, '') : null;

  return {
    key: `google:${volume.id}`,
    title: info.title,
    subtitle: info.subtitle ?? null,
    authors: info.authors ?? [],
    isbn13,
    isbn10,
    publisher: info.publisher ?? null,
    publication_year: parseYear(info.publishedDate),
    language: info.language ?? null,
    cover_url: cover,
    page_count: info.pageCount ?? null,
    description: info.description ?? null,
    source: 'google_books',
    source_id: volume.id,
  };
}

// -----------------------------------------------------------------------------
// Open Library
// -----------------------------------------------------------------------------

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  publisher?: string[];
  first_publish_year?: number;
  isbn?: string[];
  language?: string[];
  number_of_pages_median?: number;
  cover_i?: number;
};

function fromOpenLibrary(doc: OpenLibraryDoc): BookCandidate | null {
  if (!doc.title) return null;

  const isbns = doc.isbn ?? [];
  const isbn13 = isbns.find((value) => value.length === 13) ?? null;
  const isbn10 = isbns.find((value) => value.length === 10) ?? null;

  return {
    key: `openlibrary:${doc.key ?? isbn13 ?? doc.title}`,
    title: doc.title,
    subtitle: doc.subtitle ?? null,
    authors: doc.author_name ?? [],
    isbn13,
    isbn10,
    publisher: doc.publisher?.[0] ?? null,
    publication_year: doc.first_publish_year ?? null,
    // Open Library uses ISO 639-2 ("rus"); the app stores 639-1 ("ru").
    language: toTwoLetterLanguage(doc.language?.[0] ?? null),
    cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
    page_count: doc.number_of_pages_median ?? null,
    description: null,
    source: 'open_library',
    source_id: doc.key ?? null,
  };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function searchBooks(query: string, signal?: AbortSignal): Promise<BookCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // A query that is really an ISBN should go down the exact-match path.
  const asIsbn = normalizeIsbn(trimmed);
  if (asIsbn.length === 10 || asIsbn.length === 13) {
    const exact = await lookupByIsbn(asIsbn);
    if (exact) return [exact];
  }

  if (signal?.aborted) return [];

  const google = await fetchJson<{ items?: GoogleVolume[] }>(
    `${GOOGLE_BOOKS}?q=${encodeURIComponent(trimmed)}&maxResults=20&printType=books`
  );

  const results = (google?.items ?? []).map(fromGoogle).filter((b): b is BookCandidate => b !== null);
  if (results.length > 0 || signal?.aborted) return dedupe(results);

  const openLibrary = await fetchJson<{ docs?: OpenLibraryDoc[] }>(
    `${OPEN_LIBRARY}/search.json?q=${encodeURIComponent(trimmed)}&limit=20`
  );

  return dedupe(
    (openLibrary?.docs ?? []).map(fromOpenLibrary).filter((b): b is BookCandidate => b !== null)
  );
}

export async function lookupByIsbn(rawIsbn: string): Promise<BookCandidate | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (isbn.length !== 10 && isbn.length !== 13) return null;

  const google = await fetchJson<{ items?: GoogleVolume[] }>(`${GOOGLE_BOOKS}?q=isbn:${isbn}`);
  const fromGoogleBooks = google?.items?.[0] ? fromGoogle(google.items[0]) : null;
  if (fromGoogleBooks) {
    return { ...fromGoogleBooks, isbn13: fromGoogleBooks.isbn13 ?? (isbn.length === 13 ? isbn : null) };
  }

  const openLibrary = await fetchJson<{ docs?: OpenLibraryDoc[] }>(
    `${OPEN_LIBRARY}/search.json?isbn=${isbn}&limit=1`
  );
  const doc = openLibrary?.docs?.[0];
  if (!doc) return null;

  const candidate = fromOpenLibrary(doc);
  if (!candidate) return null;

  return {
    ...candidate,
    isbn13: candidate.isbn13 ?? (isbn.length === 13 ? isbn : null),
    isbn10: candidate.isbn10 ?? (isbn.length === 10 ? isbn : null),
    cover_url: candidate.cover_url ?? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
  };
}

/** Blank candidate for the manual-entry form. */
export function emptyCandidate(): BookCandidate {
  return {
    key: 'manual',
    title: '',
    subtitle: null,
    authors: [],
    isbn13: null,
    isbn10: null,
    publisher: null,
    publication_year: null,
    language: null,
    cover_url: null,
    page_count: null,
    description: null,
    source: 'manual',
    source_id: null,
  };
}

function dedupe(candidates: BookCandidate[]): BookCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    // Editions of the same book share a title+author but differ by ISBN, so the
    // ISBN is the identity where one exists.
    const identity = candidate.isbn13 ?? `${candidate.title}|${candidate.authors[0] ?? ''}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function parseYear(published: string | undefined): number | null {
  if (!published) return null;
  const match = published.match(/\d{4}/);
  if (!match) return null;
  const year = Number(match[0]);
  return year >= 1400 && year <= 2200 ? year : null;
}

const LANGUAGE_MAP: Record<string, string> = {
  eng: 'en',
  rus: 'ru',
  uzb: 'uz',
  tur: 'tr',
  ger: 'de',
  fre: 'fr',
  spa: 'es',
  ara: 'ar',
  kaa: 'kaa',
};

function toTwoLetterLanguage(code: string | null): string | null {
  if (!code) return null;
  if (code.length === 2) return code;
  return LANGUAGE_MAP[code] ?? code.slice(0, 2);
}
