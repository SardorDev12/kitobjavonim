import { useEffect, useState } from 'react';

import { adminApi, type AdminAction } from '../lib/adminApi';

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

export function AuditLogPage() {
  const [actions, setActions] = useState<AdminAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .listAuditLog()
      .then(setActions)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  if (error) return <p style={{ color: 'var(--danger)' }}>{error}</p>;
  if (!actions) return <p className="text-muted">Loading…</p>;
  if (actions.length === 0) return <p className="text-muted">No admin actions yet.</p>;

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
