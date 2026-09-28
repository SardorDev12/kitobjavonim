import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, usePathname, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// Web-only: swapped in for the staging tab's favicon at runtime (see the
// hostname check below) — imported unconditionally so Metro bundles it into
// every web build regardless of which one actually ends up using it, since
// production and staging are built by two separate Cloudflare Workers this
// repo has no control over the build env vars of.
import stagingFaviconAsset from '@/assets/images/favicon-preview.png';
import { ErrorBoundary, installGlobalErrorReporting } from '@/components/ErrorBoundary';
import { InstallAppPrompt } from '@/components/InstallAppPrompt';
import { OfflineBanner } from '@/components/OfflineBanner';
import { EmptyState, Screen } from '@/components/ui';
import { UpdateAvailableModal } from '@/components/UpdateAvailableModal';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { ThemeProvider, useTheme } from '@/theme';

// Expo Router hides the native splash screen itself as soon as this module's
// first render commits — before ThemeProvider's AsyncStorage read (below)
// resolves. A device with a stored 'dark' (or 'system', with the OS in dark
// mode) preference would then briefly paint the `mode: 'light'` default that
// read hasn't overridden yet, right after the splash screen (whose own
// background already tracks the OS scheme) disappears — read as a flash of
// the wrong color for a moment. Holding the splash up ourselves until
// `theme.modeLoaded` (see RootNavigator below) closes that gap instead.
SplashScreen.preventAutoHideAsync().catch(() => {});

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

/**
 * Bump whenever a backend change makes an already-persisted cached query
 * meaningfully wrong, not just outdated — e.g. an RLS policy change that
 * alters what a cached reference-data query should return. Persistence
 * survives app restarts independent of staleTime, so a device that fetched
 * `reference.categories` before 0026_private_custom_categories.sql shipped
 * (RLS: custom genres became private to their creator) kept serving the
 * old, fully-public list for up to REFERENCE_STALE_TIME (24h) after the
 * migration ran in production — a real bug report from exactly that gap.
 * Changing this string discards every device's persisted cache on next
 * launch instead of waiting for it to age out on its own.
 *
 * Bumped again for useLibrary() switching to paginated fetches (fixing a
 * 2000+ book library silently truncating to 1000, PostgREST's default
 * per-response row cap) — a device that already had the old, truncated
 * `library.list(...)` result persisted needed this the same way the
 * categories case above did, not just a plain refetch.
 *
 * Bumped again for 0032-0035_*.sql (categories pruned from 6 to 5, custom
 * categories removed, fiction-uz renamed to fiction, "Bolalar adabiyoti"
 * shortened) — a device that fetched `reference.categories` before those
 * migrations ran would otherwise keep showing the old 6-category list
 * with the old labels for up to REFERENCE_STALE_TIME (24h), same gap as
 * both cases above.
 *
 * Bumped again on request after another "app isn't updating" report — no
 * backend/data change actually needs this round (today's fixes are all
 * component/JS behavior, not query results), so this bump alone can't be
 * what fixes it if the JS bundle itself hasn't updated on-device yet; see
 * expo-updates' own check-on-launch/apply-on-*next*-launch behavior for
 * that. Kept anyway since it's harmless and rules the query cache out.
 */
const CACHE_BUSTER = '5';

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

const UPDATE_CHECK_TIMEOUT = 4000;

/**
 * expo-updates' own default behavior only *checks for and downloads* a new
 * OTA update on cold start — the download it starts this launch doesn't
 * become the code actually running until the *next* cold start after that.
 * That's cost real time this project: the same "the fix isn't showing up"
 * report recurring across a single day, several times, each traced back to
 * someone not having done two full relaunches yet rather than an actual
 * delivery failure. Explicitly checking, fetching, and reloading *before*
 * the splash screen comes down (see the effect that awaits this, below)
 * means a single relaunch is always enough — by the time anyone sees this
 * launch's first frame, it's already running whatever was current when
 * this launch started.
 *
 * Raced against a flat timeout rather than left to run however long the
 * network takes: this must never be why the app becomes unusable offline.
 * A slow/failed check just falls through to whatever's already installed —
 * the exact same "wait for the next relaunch" behavior this is layered on
 * top of, not a worse one.
 */
function checkForUpdateWithTimeout(): Promise<void> {
  const check = (async () => {
    // Updates.isEmbeddedLaunch is false in Expo Go and on web (and in a dev
    // client) — none of those run under eas update's channels at all, and
    // calling these APIs there either no-ops oddly or throws.
    if (!Updates.isEmbeddedLaunch) return;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
        // reloadAsync() restarts the app from the newly fetched update —
        // this function's caller never actually observes it resolving.
      }
    } catch {
      // Offline, or the check/fetch itself failed — proceed with whatever
      // this launch already has.
    }
  })();

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, UPDATE_CHECK_TIMEOUT));
  return Promise.race([check, timeout]);
}

export default function RootLayout() {
  // See checkForUpdateWithTimeout()'s own comment above — gates the splash
  // screen (in RootNavigator below) alongside theme.modeLoaded so this
  // launch is never the stale one.
  const [updateChecked, setUpdateChecked] = useState(false);
  useEffect(() => {
    checkForUpdateWithTimeout().then(() => setUpdateChecked(true));
  }, []);

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
                  buster: CACHE_BUSTER,
                  dehydrateOptions: {
                    shouldDehydrateQuery: (query) => {
                      // Listings belong to other people and go stale quickly; only
                      // the user's own library and the reference tables are worth
                      // keeping on disk for offline reading.
                      const root = query.queryKey[0];
                      const isOfflineWorthy = root === 'library' || root === 'wishlist' || root === 'reference';

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
                  <RootNavigator updateChecked={updateChecked} />
                </AuthProvider>
              </PersistQueryClientProvider>
            </ErrorBoundary>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator({ updateChecked }: { updateChecked: boolean }) {
  const theme = useTheme();
  const { session, needsOnboarding, initializing, setupError } = useAuth();
  const { ready: localeReady } = useI18n();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [navigationReady, setNavigationReady] = useState(false);

  useEffect(() => {
    setNavigationReady(true);
  }, []);

  // See preventAutoHideAsync() above — once the theme's stored preference has
  // actually been read, everything already on screen is in its final color
  // and the splash screen can safely come down with nothing left to flash to.
  // Also waits on updateChecked (see checkForUpdateWithTimeout()) so this
  // launch is already running the latest published update, if any, before
  // anyone sees its first frame — no second relaunch required.
  useEffect(() => {
    if (theme.modeLoaded && updateChecked) SplashScreen.hideAsync().catch(() => {});
  }, [theme.modeLoaded, updateChecked]);

  // The root *native* view's background — distinct from the splash screen
  // above (that's only shown once, at cold start) and from any RN-level
  // `backgroundColor` style (those only paint once JS has actually laid
  // out and rendered a frame). Without this, that native surface defaults
  // to plain white, which is what's actually behind the "white flash"
  // opening a book (or any other screen) briefly shows — the native-stack
  // push transition creates the new screen's surface a moment before RN's
  // first frame paints onto it, and on Android that gap reveals whatever
  // is underneath. expo-system-ui is already linked (it's a default Expo
  // package, not one newly added), so this is safe as a plain static import
  // unlike expo-navigation-bar below.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => {});
  }, [theme.colors.background]);

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

  // auth/telegram-login and auth/callback run as real web pages (Platform.OS
  // === 'web' is true) even when opened from the native app's own in-app
  // browser sheet for the Telegram OAuth handoff — not a genuine website
  // visit. InstallAppPrompt can't tell those apart on its own, so it's kept
  // out of this route group entirely rather than nudging someone who
  // already has the app to go install it, mid-sign-in.
  const isAuthFlowRoute = (segments as readonly string[])[0] === 'auth';

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <OfflineBanner />
      <UpdateAvailableModal />
      {isAuthFlowRoute ? null : <InstallAppPrompt />}
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
        {/* No header (matches auth/callback, its sibling bounce screen) and an
            explicit blank title — without one, the static web export bakes
            the raw route path into <title>, and since this screen can
            redirect away within a second, the root effect below that
            normally overwrites it with "Kitobjavonim" may never get the
            chance to visibly register first. */}
        <Stack.Screen name="auth/telegram-login" options={{ headerShown: false, title: '' }} />
        {/* Both render their own header (back button + actions) rather than
            the native one — react-navigation's default back button only
            appears when there's in-app history to pop, which a direct link
            or a browser refresh never has. */}
        <Stack.Screen name="book/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="listing/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
        {/* These all render their own BackHeader below (like book/[id]/
            listing/[id] above) instead of the native one — the native
            header spans the full browser width uncapped on wide web, while
            everything else on the page is centered and capped to
            maxContentWidth, so its back button sat flush to the real page
            edge instead of lining up with the content below it. */}
        <Stack.Screen name="add/manual" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="add/configure" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="library/import" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="wishlist/index" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="reading/stats" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="wishlist/add" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="wishlist/[id]" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="settings/profile" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="settings/security" options={{ headerShown: false, title: '' }} />
        <Stack.Screen name="settings/household" options={{ headerShown: false, title: '' }} />
      </Stack>
      {/* Edge-to-edge (mandatory since SDK 54) draws Android's system nav
          bar transparently over whatever the app renders underneath it —
          expo-navigation-bar's setBackgroundColorAsync no longer exists to
          fix that at the OS level, so this paints its own opaque strip
          behind it, on top of the Stack's content but still under the OS's
          own icons/pill. Without it, the nav buttons sit directly over
          scrolling text/images and are often unreadable. Icon color itself
          is handled separately, above, via NavigationBar.setStyle.
          Deliberately NOT floored to MIN_ANDROID_BOTTOM_INSET the way
          Screen.tsx floors its own padding — that floor is a tap-target
          safety margin for real footer buttons, not a measurement of the
          nav bar's actual height, and using it here painted a strip visibly
          taller than the real bar on at least one device. insets.bottom is
          the OS's own report of the bar's height; trust it for painting.
          Skipped inside (tabs): its hand-rolled bottom bar ((tabs)/_layout.tsx)
          already paints its own solid surface color all the way down through
          the same inset, and sits well taller than this strip — painting this
          on top of it hid the tab icons/labels entirely rather than helping. */}
      {Platform.OS === 'android' && insets.bottom > 0 && (segments as readonly string[])[0] !== '(tabs)' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: insets.bottom,
            backgroundColor: theme.colors.background,
          }}
        />
      ) : null}
    </>
  );
}
