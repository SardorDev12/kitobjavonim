import type { Session, User } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

type AuthValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** False until the persisted session has been restored — routing waits on this. */
  initializing: boolean;
  /** A signed-in user who has not finished the onboarding form yet. */
  needsOnboarding: boolean;
  /**
   * Set when the profile could not be read at all — in practice, migrations that
   * have not been applied to the Supabase project yet.
   */
  setupError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setSetupError(null);
      return;
    }

    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    // PostgREST answers 404/PGRST205 when the table is not in its schema cache,
    // which almost always means the migrations have not been run. Swallowing
    // that used to leave `profile` null, which read as "onboarding finished" and
    // waved the user into a Library whose every query then failed. Surface it.
    if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
      setSetupError(
        'The database tables are missing. Run the files in supabase/migrations in order, ' +
          'then reload. See docs/supabase-setup.md.'
      );
      setProfile(null);
      return;
    }

    setSetupError(null);

    // A missing profile row, by contrast, is recoverable — the
    // on_auth_user_created trigger normally creates it, but a user who signed up
    // before the trigger existed would otherwise be stuck on a blank screen.
    if (!error && !data) {
      const { data: created } = await supabase
        .from('profiles')
        .insert({ id: userId, display_name: '' })
        .select()
        .maybeSingle();
      setProfile((created as Profile) ?? null);
      return;
    }

    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        await loadProfile(data.session?.user.id);
      })
      .finally(() => {
        if (active) setInitializing(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      await loadProfile(nextSession?.user.id);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      initializing,
      needsOnboarding: Boolean(session) && profile !== null && profile.onboarded_at === null,
      setupError,
      refreshProfile: () => loadProfile(session?.user.id),
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setSetupError(null);
      },
    }),
    [session, profile, initializing, setupError, loadProfile]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
