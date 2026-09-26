import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import PagerView from 'react-native-pager-view';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goToTab, registerTabsPager, setActiveTabIndex, TAB_ROUTES, useActiveTabIndex, type TabRoute } from '@/features/tabs/activeTab';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

import AddScreen from './add';
import DiscoverScreen from './discover';
import ReadingTrackerScreen from './index';
import LibraryScreen from './library';
import ProfileScreen from './profile';

// The pager's own full-width swipe made ordinary vertical scrolling or
// button taps in the middle of a tab misfire as a page change — swiping
// between tabs now only works from a thin strip at each screen edge,
// matching the iOS edge-swipe-back convention, with the pager's native
// gesture (scrollEnabled below) turned off entirely.
const EDGE_ZONE_WIDTH = 32;
const EDGE_SWIPE_THRESHOLD = 48;

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
  const activeIndex = useActiveTabIndex();

  function goToIndex(index: number) {
    goToTab(TAB_ROUTES[Math.max(0, Math.min(TAB_ROUTES.length - 1, index))]);
  }

  // .onEnd runs as a worklet (reanimated is installed), so the actual page
  // change — a call into the native pager through goToTab() — has to hop
  // back to the JS thread via runOnJS. Recreated each render, which is the
  // normal/cheap way to use Gesture.Pan(); it just means these always close
  // over the activeIndex this render saw, which is exactly the one that
  // matters at release time.
  const leftEdgeSwipe = Gesture.Pan().onEnd((e) => {
    if (e.translationX > EDGE_SWIPE_THRESHOLD) runOnJS(goToIndex)(activeIndex - 1);
  });
  const rightEdgeSwipe = Gesture.Pan().onEnd((e) => {
    if (e.translationX < -EDGE_SWIPE_THRESHOLD) runOnJS(goToIndex)(activeIndex + 1);
  });

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
      <View style={{ flex: 1 }}>
        <PagerView
          ref={registerTabsPager}
          style={{ flex: 1 }}
          initialPage={initialPage}
          scrollEnabled={false}
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

        <GestureDetector gesture={leftEdgeSwipe}>
          <View style={styles.edgeZoneLeft} />
        </GestureDetector>
        <GestureDetector gesture={rightEdgeSwipe}>
          <View style={styles.edgeZoneRight} />
        </GestureDetector>
      </View>

      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            paddingBottom: insets.bottom,
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
  edgeZoneLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE_ZONE_WIDTH },
  edgeZoneRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: EDGE_ZONE_WIDTH },
});
