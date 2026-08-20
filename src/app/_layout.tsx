import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, usePathname, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Web-only: swapped in for the staging tab's favicon at runtime (see the
// hostname check below) — imported unconditionally so Metro bundles it into
// every web build regardless of which one actually ends up using it, since
// production and staging are built by two separate Cloudflare Workers this
// repo has no control over the build env vars of.
import stagingFaviconAsset from '@/assets/images/favicon-preview.png';
import { ErrorBoundary, installGlobalErrorReporting } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { EmptyState, Screen } from '@/components/ui';
import { UpdateAvailableModal } from '@/components/UpdateAvailableModal';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { ThemeProvider, useTheme } from '@/theme';

/**
 * `gcTime` has to outlive `staleTime` for persistence to be worth anything: it
 * is what decides how long a cached answer survives on disk, and therefore how
 * much of the library is readable with no connection. A week covers a trip.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'home-library.query-cache',
  throttleTime: 2000,
});

// React Query's default focus tracking is web-only; this is what lets a phone
// returning from the background refetch instead of showing stale shelves.
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

export default function RootLayout() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  // Every drop zone in the app only guards its own bounds. Without a
  // page-wide backstop, a file dropped a few pixels outside one — easy to do,
  // since the zones are small — falls through to the browser's default
  // action: navigating the whole tab away to display the raw image. That
  // reads as "drag-and-drop is broken" even when the zone the user meant to
  // hit works fine, so this suppresses the default everywhere, once.
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const swallow = (event: DragEvent) => {
      if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
    };

    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return installGlobalErrorReporting();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <ErrorBoundary>
              <PersistQueryClientProvider
                client={queryClient}
                persistOptions={{
                  persister,
                  maxAge: 1000 * 60 * 60 * 24 * 7,
                  dehydrateOptions: {
                    shouldDehydrateQuery: (query) => {
                      // Listings belong to other people and go stale quickly; only
                      // the user's own library and the reference tables are worth
                      // keeping on disk for offline reading.
                      const root = query.queryKey[0];
                      const isOfflineWorthy =
                        root === 'library' || root === 'bookshelves' || root === 'reference';

                      // The status check is not optional. React Query will happily
                      // dehydrate a query that is still pending, and its in-flight
                      // promise does not survive a trip through JSON — on the next
                      // launch hydration calls `.then` on a plain object and the
                      // whole restore throws. Only settled data goes to disk.
                      return isOfflineWorthy && query.state.status === 'success';
                    },
                  },
                }}
              >
                <AuthProvider>
                  <RootNavigator />
                </AuthProvider>
              </PersistQueryClientProvider>
            </ErrorBoundary>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const theme = useTheme();
  const { session, needsOnboarding, initializing, setupError } = useAuth();
  const { ready: localeReady } = useI18n();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const [navigationReady, setNavigationReady] = useState(false);

  useEffect(() => {
    setNavigationReady(true);
  }, []);

  // Mandatory edge-to-edge (Expo SDK 54+) draws Android's system navigation
  // bar transparently over the app's own background, so its button/gesture-
  // pill color has to be set explicitly to stay visible against whatever the
  // current theme's background is — 'auto' doesn't track this app's own
  // scheme, only the OS's, which can disagree with it. Same light/dark
  // inversion as the StatusBar below.
  //
  // Imported dynamically, not with a top-level `import` — this native
  // module ships in the JS bundle immediately (OTA), but the currently
  // installed binary won't have it linked until the next native build goes
  // out. A static import evaluates unconditionally the moment this file
  // loads and would crash every install still on the old binary the
  // instant this update reaches them.
  //
  // A dynamic import alone isn't enough, despite looking async: Metro's
  // module loader (guardedLoadModule, underneath its asyncRequire) throws
  // synchronously the moment a genuinely-missing native module is required,
  // before the returned value is even a pending promise a `.then().catch()`
  // chain could attach to — confirmed in production via Crashlytics
  // (`Cannot find native module 'ExpoNavigationBar'`, uncaught, on old
  // installs mid-rollout) even with that chain in place. Only a real
  // try/await/catch around the import call itself absorbs both the
  // synchronous throw and an ordinary async rejection the same way.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const NavigationBar = await import('expo-navigation-bar');
        NavigationBar.setStyle(theme.scheme === 'dark' ? 'light' : 'dark');
      } catch {
        // Not linked into this binary yet — icons stay whatever they were.
      }
    })();
  }, [theme.scheme]);

  // Expo Router's web integration syncs document.title to whatever the
  // focused screen's/tab's `options.title` is, which makes the browser tab
  // flicker between "Library", "Discover", etc. as the user navigates. The
  // brand name reads better as a fixed constant than as a page-by-page label,
  // so this re-asserts it after every navigation rather than fighting the
  // per-screen `title` options that also drive the tab bar labels.
  //
  // Read from the actual hostname the page loaded from, not an env var —
  // that way it's right regardless of which .env the build happened to be
  // made with, and it's what actually lets a staging and a production tab
  // sit side by side without looking identical. `test.` covers the current
  // staging domain (test.kitobjavonim.uz); `staging` is kept too for the
  // Worker's old *.workers.dev URL, in case that's ever opened directly.
  useEffect(() => {
    if (Platform.OS === 'web') {
      const hostname = window.location.hostname;
      const isStaging = hostname.startsWith('test.') || hostname.includes('staging');
      document.title = isStaging ? 'Kitobjavonim (Test)' : 'Kitobjavonim';

      if (isStaging) {
        const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (favicon) favicon.href = stagingFaviconAsset as unknown as string;
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (initializing || !navigationReady) return;

    // Widened to a plain string array up front, not just at the first access:
    // expo-router infers useSegments()'s tuple shape from the routes it has
    // discovered, and that inference lives in .expo/types/router.d.ts — a file
    // `expo start` writes but `expo export` never does. A route added since the
    // last dev-server run, or any build that skips `expo start` entirely (the
    // production build does), can leave that file stale, missing, or narrower
    // than the app's actual routes, which makes indexing past its inferred
    // length a compile error. None of that bears on whether the segment is
    // actually there at runtime, so the fix is to stop trusting the inferred
    // length rather than to keep patching each new index as it comes up.
    const path = segments as readonly string[];
    const group = path[0];
    const inAuthGroup = group === '(auth)';
    const onOnboarding = group === 'onboarding';

    // Discovery and listing pages stay open to signed-out visitors: the RLS
    // policies already expose exactly those rows to `anon`, it lets someone see
    // what is on offer before committing to an account, and it is what makes
    // listing URLs worth sharing. legal/* (privacy, terms) is public too — the
    // sign-up screen links to it before there's a session, and an app store
    // reviewer needs to reach it without one either. Everything else needs a
    // session.
    const isPublicRoute =
      (group === '(tabs)' && path[1] === 'discover') || group === 'listing' || group === 'legal';

    // auth/callback and auth/telegram-login run before a session exists by
    // definition — bouncing them to sign-in would abort the token exchange
    // they were opened to finish.
    const isAuthFlowRoute = group === 'auth';

    if (!session) {
      // Bouncing here must stop once the exchange lands a session below — an
      // unconditional early return for the whole "auth" group used to do that,
      // which also meant nothing ever moved the user off auth/callback once
      // sign-in actually succeeded, leaving it spinning on its loading state
      // forever. Skipping only the sign-in redirect fixes that.
      if (!inAuthGroup && !isAuthFlowRoute && !isPublicRoute) {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    if (needsOnboarding && !onOnboarding) {
      router.replace('/onboarding');
      return;
    }

    if (!needsOnboarding && (inAuthGroup || onOnboarding || isAuthFlowRoute)) {
      router.replace('/(tabs)');
    }
  }, [session, needsOnboarding, initializing, navigationReady, segments, router]);

  if (initializing || !localeReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  // Stop here rather than letting the user into an app where nothing can load.
  if (setupError) {
    return (
      <>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <Screen>
          <EmptyState tone="error" title="Backend not set up" body={setupError} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <OfflineBanner />
      <UpdateAvailableModal />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        {/* Both render their own header (back button + actions) rather than
            the native one — react-navigation's default back button only
            appears when there's in-app history to pop, which a direct link
            or a browser refresh never has. */}
        <Stack.Screen name="book/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
        <Stack.Screen name="add/scan" options={{ presentation: 'modal', title: '' }} />
        <Stack.Screen name="add/manual" options={{ title: '' }} />
        <Stack.Screen name="add/configure" options={{ title: '' }} />
        <Stack.Screen name="bookshelves/index" options={{ title: '' }} />
        <Stack.Screen name="settings/profile" options={{ title: '' }} />
        <Stack.Screen name="settings/security" options={{ title: '' }} />
        <Stack.Screen name="settings/household" options={{ title: '' }} />
      </Stack>
    </>
  );
}
