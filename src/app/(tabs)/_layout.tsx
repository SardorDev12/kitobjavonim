import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import PagerView from 'react-native-pager-view';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goToTab, registerTabsPager, setActiveTabIndex, TAB_ROUTES, useActiveTabIndex, type TabRoute } from '@/features/tabs/activeTab';
import { useI18n } from '@/lib/i18n';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useTheme } from '@/theme';

import AddScreen from './add';
import DiscoverScreen from './discover';
import ReadingTrackerScreen from './index';
import LibraryScreen from './library';
import ProfileScreen from './profile';

const ICONS: Record<TabRoute, keyof typeof Ionicons.glyphMap> = {
  index: 'book-outline',
  library: 'library-outline',
  discover: 'swap-horizontal',
  add: 'add-circle',
  profile: 'person-outline',
};

/**
 * Swipeable tabs, replacing Expo Router's <Tabs> — its bottom-tabs navigator
 * has no pager underneath it (confirmed by reading the vendored package
 * directly), so true finger-tracked swipe between all 5 tabs means hosting
 * them as PagerView pages instead of separate routes, with a hand-rolled
 * bottom bar kept in sync via features/tabs/activeTab.ts.
 *
 * This is a real trade-off: (tabs)/profile, /discover, /add no longer
 * resolve as distinct routes (the layout doesn't render whatever Expo
 * Router thinks matched), so anything that used to `router.push`/`replace`
 * to one of those specific paths now calls goToTab() instead — see
 * LegalPage.tsx, listing/[id].tsx, add/configure.tsx. Plain `/(tabs)`
 * navigation (no sub-path) is unaffected, since that's the group's own
 * route, not one of these sub-paths.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  // A deep link or shared URL can target a specific sub-route directly (e.g.
  // /(tabs)/discover, which _layout.tsx's signed-out route guard leaves
  // public) — segments still reflect that match even though this layout no
  // longer renders a distinct screen per route, so the pager should open on
  // whichever page was actually requested instead of always defaulting to
  // Reading.
  // Widened for the same reason root _layout.tsx widens its own segments: the
  // tuple shape expo-router infers depends on .expo/types/router.d.ts, which
  // can be stale, missing, or narrower than the app's real routes.
  const segments = useSegments() as readonly string[];
  const [initialPage] = useState(() => {
    const requested = segments[1] as TabRoute | undefined;
    const index = requested ? TAB_ROUTES.indexOf(requested) : -1;
    return index >= 0 ? index : TAB_ROUTES.indexOf('index');
  });
  useEffect(() => {
    setActiveTabIndex(initialPage);
    // Only meant to seed the bottom bar's highlight to match the page the
    // pager actually opens on — must not re-run when the pager itself later
    // changes activeIndex via onPageSelected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Under edge-to-edge, opening the keyboard on a screen inside a tab (e.g.
  // Discover's search field) doesn't shrink the window — the tab bar stays
  // rendered at its usual spot at the true bottom of the screen, which the
  // keyboard then just draws over. Lifting it by the keyboard's height keeps
  // it reachable instead of hidden underneath — same fix the old <Tabs>
  // config applied via tabBarStyle's transform.
  const keyboardHeight = useKeyboardHeight();
  const activeIndex = useActiveTabIndex();

  function labelFor(route: TabRoute): string {
    switch (route) {
      case 'index':
        return t('reading.tabLabel');
      case 'library':
        return t('tabs.library');
      case 'discover':
        return t('tabs.discover');
      case 'add':
        return t('tabs.add');
      case 'profile':
        return t('tabs.profile');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <PagerView
        ref={registerTabsPager}
        style={{ flex: 1 }}
        initialPage={initialPage}
        onPageSelected={(e) => setActiveTabIndex(e.nativeEvent.position)}
      >
        <View key="index" style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <ReadingTrackerScreen />
        </View>
        <View key="library" style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <LibraryScreen />
        </View>
        <View key="discover" style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <DiscoverScreen />
        </View>
        <View key="add" style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <AddScreen />
        </View>
        <View key="profile" style={{ flex: 1, backgroundColor: theme.colors.background }}>
          <ProfileScreen />
        </View>
      </PagerView>

      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            paddingBottom: insets.bottom,
            ...(keyboardHeight > 0 ? { transform: [{ translateY: -keyboardHeight }] } : null),
          },
        ]}
      >
        {TAB_ROUTES.map((route, index) => {
          const active = index === activeIndex;
          const color = active ? theme.colors.primary : theme.colors.textSubtle;
          return (
            <Pressable
              key={route}
              onPress={() => goToTab(route)}
              accessibilityRole="button"
              accessibilityLabel={labelFor(route)}
              style={styles.tabButton}
            >
              <Ionicons name={ICONS[route]} size={route === 'add' ? 26 : 22} color={color} />
              <Text style={[styles.label, { color }]}>{labelFor(route)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tabButton: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: '600' },
});
