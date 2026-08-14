import { useEffect, useState } from 'react';

import { adminApi, type AdminStats } from '../lib/adminApi';

export function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .stats()
      .then(setStats)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!stats) return <p className="text-muted">Loading…</p>;

  const tiles: [string, number][] = [
    ['Users', stats.total_users],
    ['New users (7d)', stats.new_users_7d],
    ['Books in catalog', stats.total_books],
    ['Active listings', stats.total_listings],
    ['New listings (7d)', stats.new_listings_7d],
    ['Open reports', stats.open_reports],
    ['Resolved reports', stats.resolved_reports],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
      {tiles.map(([label, value]) => (
        <div key={label} className="card">
          <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
