import { useEffect, useState, type CSSProperties } from 'react';

import { adminApi, type AdminListing } from '../lib/adminApi';

export function ListingsPage() {
  const [search, setSearch] = useState('');
  const [listings, setListings] = useState<AdminListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load(query: string) {
    adminApi
      .listListings(query)
      .then(setListings)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }

  useEffect(() => {
    const timer = setTimeout(() => load(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function unlist(listing: AdminListing) {
    if (!confirm(`Take "${listing.title}" off discovery? It stays in ${listing.owner_name}'s library.`)) return;
    setBusyId(listing.user_book_id);
    try {
      await adminApi.unlist(listing.user_book_id);
      load(search.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <input
        className="input"
        placeholder="Search by title or owner name…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        style={{ maxWidth: 360 }}
      />

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {!listings ? (
        <p className="text-muted">Loading…</p>
      ) : listings.length === 0 ? (
        <p className="text-muted">No listings match.</p>
      ) : (
        <table>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 13, color: 'var(--text-muted)' }}>
              <th style={cellStyle}>Book</th>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Owner</th>
              <th style={cellStyle}>Reports</th>
              <th style={cellStyle}>Listed</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing) => (
              <tr key={listing.user_book_id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={cellStyle}>
                  <div style={{ fontWeight: 600 }}>{listing.title}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {listing.authors.join(', ')}
                  </div>
                </td>
                <td style={cellStyle}>
                  {listing.availability_type}
                  {listing.sale_price ? ` · ${listing.sale_price}` : ''}
                </td>
                <td style={cellStyle}>
                  <div>{listing.owner_name}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {listing.owner_email}
                  </div>
                </td>
                <td style={cellStyle}>
                  {listing.open_report_count > 0 ? (
                    <span className="badge badge-warning">{listing.open_report_count}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td style={cellStyle}>{listing.listed_at ? new Date(listing.listed_at).toLocaleDateString() : '—'}</td>
                <td style={cellStyle}>
                  <button
                    className="button button-danger"
                    disabled={busyId === listing.user_book_id}
                    onClick={() => unlist(listing)}
                  >
                    {busyId === listing.user_book_id ? 'Removing…' : 'Unlist'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const cellStyle: CSSProperties = { padding: '8px 10px' };
