import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
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
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const theme = useTheme();
  const { session, needsOnboarding, initializing } = useAuth();
  const { ready: localeReady } = useI18n();
  const segments = useSegments();
  const router = useRouter();
  const [navigationReady, setNavigationReady] = useState(false);

  useEffect(() => {
    setNavigationReady(true);
  }, []);

  useEffect(() => {
    if (initializing || !navigationReady) return;

    const group = segments[0];
    const inAuthGroup = group === '(auth)';
    const onOnboarding = group === 'onboarding';

    // Discovery and listing pages stay open to signed-out visitors: the RLS
    // policies already expose exactly those rows to `anon`, it lets someone see
    // what is on offer before committing to an account, and it is what makes
    // listing URLs worth sharing. Everything else needs a session.
    const isPublicRoute = (group === '(tabs)' && segments[1] === 'discover') || group === 'listing';

    if (!session && !inAuthGroup && !isPublicRoute) {
      router.replace('/(auth)/sign-in');
      return;
    }

    if (session && needsOnboarding && !onOnboarding) {
      router.replace('/onboarding');
      return;
    }

    if (session && !needsOnboarding && (inAuthGroup || onOnboarding)) {
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

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
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
        <Stack.Screen name="book/[id]" options={{ title: '' }} />
        <Stack.Screen name="listing/[id]" options={{ title: '' }} />
        <Stack.Screen name="add/scan" options={{ presentation: 'modal', title: '' }} />
        <Stack.Screen name="add/manual" options={{ title: '' }} />
        <Stack.Screen name="add/configure" options={{ title: '' }} />
        <Stack.Screen name="bookshelves/index" options={{ title: '' }} />
        <Stack.Screen name="settings/profile" options={{ title: '' }} />
      </Stack>
    </>
  );
}
