import { useState } from 'react';

import { LoginScreen } from './LoginScreen';
import { useAdminAuth } from './lib/useAdminAuth';
import { useIdleSignOut } from './lib/useIdleSignOut';
import { BooksPage } from './pages/BooksPage';
import { DashboardPage } from './pages/DashboardPage';
import { ListingsPage } from './pages/ListingsPage';
import { ReportsPage } from './pages/ReportsPage';
import { UsersPage } from './pages/UsersPage';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'reports', label: 'Reports' },
  { id: 'listings', label: 'Listings' },
  { id: 'books', label: 'Books' },
  { id: 'users', label: 'Users' },
] as const;

type Section = (typeof SECTIONS)[number]['id'];

export function App() {
  const auth = useAdminAuth();
  const [section, setSection] = useState<Section>('dashboard');

  useIdleSignOut(auth.status === 'authorized', auth.signOut);

  if (auth.status === 'loading') return null;
  if (auth.status === 'signed-out') return <LoginScreen notice={auth.notice} />;

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <nav style={{ display: 'flex', gap: 4 }}>
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              className="button"
              style={{
                border: 'none',
                background: section === item.id ? 'var(--bg)' : 'transparent',
                fontWeight: section === item.id ? 700 : 500,
              }}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="text-muted" style={{ fontSize: 13 }}>
            {auth.email}
          </span>
          <button className="button" onClick={auth.signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
        {section === 'dashboard' ? <DashboardPage /> : null}
        {section === 'reports' ? <ReportsPage /> : null}
        {section === 'listings' ? <ListingsPage /> : null}
        {section === 'books' ? <BooksPage /> : null}
        {section === 'users' ? <UsersPage currentUserId={auth.userId} /> : null}
      </main>
    </div>
  );
}
