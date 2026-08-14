import { useEffect, useState } from 'react';

import { supabase } from './supabaseClient';

export type AdminAuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; notice?: string }
  | { status: 'authorized'; userId: string; email: string };

/**
 * A valid Supabase session is necessary but not sufficient — every admin
 * RPC and the admin-users Edge Function re-check profiles.is_admin
 * server-side regardless of what this hook decides, so this exists purely
 * to keep a non-admin who happens to sign in (any consumer-app account can)
 * from seeing the panel's shell at all, not as the real security boundary.
 */
export function useAdminAuth(): AdminAuthState & { signOut: () => void } {
  const [state, setState] = useState<AdminAuthState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function checkSession(userId: string | undefined, email: string | undefined) {
      if (!userId) {
        if (!cancelled) setState({ status: 'signed-out' });
        return;
      }

      const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', userId).single();
      if (cancelled) return;

      if (error || !data?.is_admin) {
        await supabase.auth.signOut();
        if (!cancelled) {
          setState({
            status: 'signed-out',
            notice: 'That account is not an admin on this project.',
          });
        }
        return;
      }

      setState({ status: 'authorized', userId, email: email ?? '' });
    }

    supabase.auth.getSession().then(({ data }) => {
      void checkSession(data.session?.user.id, data.session?.user.email);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void checkSession(session?.user.id, session?.user.email);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { ...state, signOut: () => void supabase.auth.signOut() };
}
