import { useEffect, useState, type FormEvent } from 'react';

import { adminApi, type AdminUser } from '../lib/adminApi';

export function UsersPage({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load(query: string) {
    adminApi
      .listUsers(query)
      .then(setUsers)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }

  useEffect(() => {
    const timer = setTimeout(() => load(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function run(userId: string, action: () => Promise<unknown>) {
    setBusyId(userId);
    setError(null);
    try {
      await action();
      load(search.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  }

  function toggleAdmin(user: AdminUser) {
    const verb = user.is_admin ? 'Remove admin access from' : 'Grant admin access to';
    if (!confirm(`${verb} ${user.email}?`)) return;
    run(user.user_id, () => adminApi.setAdmin(user.user_id, !user.is_admin));
  }

  function toggleBan(user: AdminUser) {
    const verb = user.is_banned ? 'Unban' : 'Ban';
    if (!confirm(`${verb} ${user.email}? ${user.is_banned ? '' : 'They will not be able to sign in.'}`)) return;
    run(user.user_id, () => adminApi.setBan(user.user_id, !user.is_banned));
  }

  function remove(user: AdminUser) {
    if (!confirm(`Permanently delete ${user.email}'s account and everything in it? This cannot be undone.`)) return;
    run(user.user_id, () => adminApi.deleteUser(user.user_id));
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="Search by name or email…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ maxWidth: 360 }}
        />
        <button className="button button-primary" onClick={() => setCreating(true)}>
          + New admin
        </button>
      </div>

      {creating ? (
        <CreateAdminForm
          onDone={() => {
            setCreating(false);
            load(search.trim());
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {!users ? (
        <p className="text-muted">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-muted">No users match.</p>
      ) : (
        <table>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 13, color: 'var(--text-muted)' }}>
              <th style={cellStyle}>User</th>
              <th style={cellStyle}>Books</th>
              <th style={cellStyle}>Status</th>
              <th style={cellStyle}>Joined</th>
              <th style={cellStyle}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const busy = busyId === user.user_id;
              const isSelf = user.user_id === currentUserId;
              return (
                <tr key={user.user_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={cellStyle}>
                    <div style={{ fontWeight: 600 }}>{user.display_name || '—'}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {user.email}
                    </div>
                  </td>
                  <td style={cellStyle}>
                    {user.book_count} ({user.listing_count} listed)
                  </td>
                  <td style={cellStyle}>
                    {user.is_admin ? <span className="badge badge-success">Admin</span> : null}{' '}
                    {user.is_banned ? <span className="badge badge-danger">Banned</span> : null}
                  </td>
                  <td style={cellStyle}>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="button" disabled={busy || (isSelf && user.is_admin)} onClick={() => toggleAdmin(user)}>
                        {user.is_admin ? 'Demote' : 'Promote'}
                      </button>
                      <button className="button" disabled={busy || isSelf || user.is_admin} onClick={() => toggleBan(user)}>
                        {user.is_banned ? 'Unban' : 'Ban'}
                      </button>
                      <button
                        className="button button-danger"
                        disabled={busy || isSelf || user.is_admin}
                        onClick={() => remove(user)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateAdminForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await adminApi.createAdmin(email.trim(), password, displayName.trim());
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Email
        <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Display name
        <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Password (12+ characters)
        <input
          className="input"
          type="password"
          minLength={12}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error ? <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create admin'}
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const cellStyle = { padding: '8px 10px' };
