import { useEffect, useState } from 'react';

import { Picker } from '../components/Picker';
import { adminApi, type AdminAction, type AuditSort } from '../lib/adminApi';

const ACTION_LABELS: Record<string, string> = {
  promote_admin: 'Promoted to admin',
  demote_admin: 'Removed admin access',
  ban_user: 'Banned',
  unban_user: 'Unbanned',
  delete_user: 'Deleted account',
  create_admin: 'Created admin account',
  unlist_listing: 'Unlisted',
  update_book: 'Edited catalog entry',
  delete_book: 'Deleted catalog entry',
  resolve_report: 'Resolved report',
};

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

const SORTS: { value: AuditSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

export function AuditLogPage() {
  const [actions, setActions] = useState<AdminAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [sort, setSort] = useState<AuditSort>('newest');

  useEffect(() => {
    setActions(null);
    adminApi
      .listAuditLog(action || null, sort)
      .then(setActions)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [action, sort]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Picker label="Show" value={action} options={ACTION_OPTIONS} onChange={setAction} />
        <Picker label="Sort" value={sort} options={SORTS} onChange={setSort} />
      </div>
      {error ? (
        <p style={{ color: 'var(--danger)' }}>{error}</p>
      ) : !actions ? (
        <p className="text-muted">Loading…</p>
      ) : actions.length === 0 ? (
        <p className="text-muted">{action ? 'No actions of this kind.' : 'No admin actions yet.'}</p>
      ) : (
        <AuditTable actions={actions} />
      )}
    </div>
  );
}

function AuditTable({ actions }: { actions: AdminAction[] }) {
  return (
    <table>
      <thead>
        <tr style={{ textAlign: 'left', fontSize: 13, color: 'var(--text-muted)' }}>
          <th style={cellStyle}>When</th>
          <th style={cellStyle}>Admin</th>
          <th style={cellStyle}>Action</th>
          <th style={cellStyle}>Target</th>
          <th style={cellStyle}>Details</th>
        </tr>
      </thead>
      <tbody>
        {actions.map((row) => (
          <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={cellStyle}>{new Date(row.created_at).toLocaleString()}</td>
            <td style={cellStyle}>{row.admin_name || row.admin_id || '—'}</td>
            <td style={cellStyle}>{ACTION_LABELS[row.action] ?? row.action}</td>
            <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 12 }}>
              {row.target_id ? row.target_id.slice(0, 8) : '—'}
            </td>
            <td style={cellStyle} className="text-muted">
              {row.details ? JSON.stringify(row.details) : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const cellStyle = { padding: '8px 10px' };
