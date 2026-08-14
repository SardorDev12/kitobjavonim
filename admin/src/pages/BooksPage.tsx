import { useEffect, useState } from 'react';

import { adminApi, type BookUpdate } from '../lib/adminApi';
import { supabase } from '../lib/supabaseClient';

type Book = {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publication_year: number | null;
  language: string | null;
  cover_url: string | null;
  description: string | null;
};

export function BooksPage() {
  const [search, setSearch] = useState('');
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function load(query: string) {
    // The catalog is public-readable (0003_rls.sql) — no admin RPC needed
    // just to browse it, only to change or remove someone else's entry.
    let request = supabase
      .from('books')
      .select('id, title, subtitle, authors, publisher, publication_year, language, cover_url, description')
      .order('title')
      .limit(50);
    if (query) request = request.ilike('title', `%${query}%`);

    request.then(({ data, error: queryError }) => {
      if (queryError) setError(queryError.message);
      else setBooks(data as Book[]);
    });
  }

  useEffect(() => {
    const timer = setTimeout(() => load(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function remove(book: Book) {
    if (!confirm(`Delete "${book.title}" from the catalog entirely? This cannot be undone.`)) return;
    try {
      await adminApi.deleteBook(book.id);
      load(search.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function save(bookId: string, update: BookUpdate) {
    try {
      await adminApi.updateBook(bookId, update);
      setEditingId(null);
      load(search.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <input
        className="input"
        placeholder="Search by title…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        style={{ maxWidth: 360 }}
      />

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {!books ? (
        <p className="text-muted">Loading…</p>
      ) : books.length === 0 ? (
        <p className="text-muted">No books match.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {books.map((book) =>
            editingId === book.id ? (
              <BookEditForm key={book.id} book={book} onCancel={() => setEditingId(null)} onSave={save} />
            ) : (
              <div key={book.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{book.title}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {book.authors.join(', ') || '—'}
                    {book.publication_year ? ` · ${book.publication_year}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button className="button" onClick={() => setEditingId(book.id)}>
                    Edit
                  </button>
                  <button className="button button-danger" onClick={() => remove(book)}>
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function BookEditForm({
  book,
  onCancel,
  onSave,
}: {
  book: Book;
  onCancel: () => void;
  onSave: (bookId: string, update: BookUpdate) => void;
}) {
  const [title, setTitle] = useState(book.title);
  const [subtitle, setSubtitle] = useState(book.subtitle ?? '');
  const [authors, setAuthors] = useState(book.authors.join(', '));
  const [publisher, setPublisher] = useState(book.publisher ?? '');
  const [year, setYear] = useState(book.publication_year?.toString() ?? '');
  const [language, setLanguage] = useState(book.language ?? '');
  const [coverUrl, setCoverUrl] = useState(book.cover_url ?? '');
  const [description, setDescription] = useState(book.description ?? '');

  function submit() {
    const parsedYear = Number(year);
    onSave(book.id, {
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      authors: authors
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      publisher: publisher.trim() || null,
      publication_year: Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : null,
      language: language.trim() || null,
      cover_url: coverUrl.trim() || null,
      description: description.trim() || null,
    });
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <Field label="Title" value={title} onChange={setTitle} />
      <Field label="Subtitle" value={subtitle} onChange={setSubtitle} />
      <Field label="Authors (comma separated)" value={authors} onChange={setAuthors} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Publisher" value={publisher} onChange={setPublisher} />
        <Field label="Year" value={year} onChange={setYear} />
      </div>
      <Field label="Language (uz/ru/en…)" value={language} onChange={setLanguage} />
      <Field label="Cover URL" value={coverUrl} onChange={setCoverUrl} />
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Description
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="button button-primary" onClick={submit}>
          Save
        </button>
        <button className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
      {label}
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
