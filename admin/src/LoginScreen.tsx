import { useState, type FormEvent } from 'react';

import { supabase } from './lib/supabaseClient';

/**
 * Email + password only, deliberately. No sign-up link, no OAuth buttons —
 * an admin account can only be created by another admin, from inside the
 * panel itself (see UsersPage), or bootstrapped once by hand (see
 * admin-users' README for that one-time step).
 */
export function LoginScreen({ notice }: { notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError(signInError.message);
    setSubmitting(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: 340, display: 'grid', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>Kitob Javonim admin</h1>
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Sign in with an admin account.
          </p>
        </div>

        {notice ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>{notice}</p>
        ) : null}

        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          Email
          <input
            className="input"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          Password
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p> : null}

        <button type="submit" className="button button-primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
