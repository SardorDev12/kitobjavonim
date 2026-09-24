import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import appIconAsset from '@/assets/images/icon.png';
import { Text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useLayout, useTheme } from '@/theme';

// expo-router doesn't re-export the tab bar's own prop type publicly (it
// lives at an internal react-navigation/bottom-tabs path not meant to be
// imported directly) — this is just the slice of it Sidebar actually uses.
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string; params?: object }[] };
  descriptors: Record<
    string,
    { options: { title?: string; tabBarIcon?: (props: { focused: boolean; color: string; size: number }) => ReactNode } }
  >;
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string, params?: object) => void;
  };
  insets: { top: number; bottom: number; left: number; right: number };
};

/**
 * Web keeps the classic per-route Tabs navigator — the sibling _layout.tsx's
 * swipeable PagerView is native-only and can't ship here at all: Metro
 * refuses to bundle react-native-pager-view for web (it statically imports
 * react-native's native-only codegenNativeCommands internals), which broke
 * every OTA export (`eas update` bundles ios/android/web together) the
 * moment that import existed anywhere reachable from a plain .tsx file. The
 * .web.tsx extension keeps this file out of that import graph entirely for
 * web builds — Metro/webpack pick this file over _layout.tsx when bundling
 * for the web platform.
 *
 * The bar switches from bottom to a left sidebar at the same `isWide`
 * breakpoint every other screen already uses to widen its own content (see
 * useLayout()'s own doc comment — "tablet and up, safe to show ... a
 * sidebar" was written for exactly this). Narrow web keeps the library's
 * own default bottom bar entirely (no `tabBar` override at all below) —
 * wide web renders `Sidebar`, a custom `tabBar` instead of the built-in
 * one. Two reasons that's necessary rather than just `tabBarPosition:
 * 'left'` on the built-in bar: (1) the built-in sidebar's active-item
 * background comes from React Navigation's own default theme, not this
 * app's — with no `tabBarActiveBackgroundColor` set, it renders a stock
 * blue pill that matches nothing else in the app; (2) a collapse/expand
 * toggle has no equivalent in the built-in bar's own options at all.
 * `tabBar` (a real expo-router/react-navigation prop, not custom plumbing)
 * keeps every bit of Tabs/Tabs.Screen's routing, active-state and icon
 * config intact and only replaces how the bar itself is drawn.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  const { isWide } = useLayout();

  return (
    <Tabs
      // tabBar is a direct prop of the navigator itself (BottomTabNavigationConfig),
      // not a screenOptions entry (BottomTabNavigationOptions) — passing it inside
      // screenOptions below silently did nothing at all; the navigator only ever
      // reads it from here.
      {...(isWide ? { tabBar: (props: TabBarProps) => <Sidebar {...props} /> } : null)}
      screenOptions={{
        headerShown: false,
        // The outer content/bar row-vs-column arrangement is driven by this
        // regardless of which component actually draws the bar — dropping
        // it once a custom `tabBar` above takes over drawing left the outer
        // layout still stacked as a column with the bar's slot pinned to
        // the bottom, squeezing Sidebar's own left-column content sideways
        // into a short bottom strip instead of a tall left rail.
        tabBarPosition: isWide ? 'left' : 'bottom',
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        sceneStyle: { backgroundColor: theme.colors.background },
        ...(isWide
          ? null
          : {
              tabBarStyle: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('reading.tabLabel'),
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ color, size }) => <Ionicons name="library-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: t('tabs.discover'),
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('tabs.add'),
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const SIDEBAR_COLLAPSED_KEY = 'settings.sidebarCollapsed';
const EXPANDED_WIDTH = 232;
// A slim icon-only rail rather than the earlier zero-width-plus-floating-
// button design — that couldn't animate cleanly (a `position: fixed`
// overlay doesn't participate in flex layout, so there was no single
// property to tween between it and a normal-flow sidebar without a jump).
// A persistent rail is just a width change, which the width/opacity
// Animated.Value below can drive smoothly.
const COLLAPSED_WIDTH = 64;
const TRANSITION_MS = 220;

/**
 * A left nav rail standing in for the built-in bottom-tab bar on wide web —
 * see TabsLayout's own comment for why. `state`/`descriptors`/`navigation`
 * are exactly what the built-in bar itself receives (TabBarProps is a
 * hand-typed slice of the library's own BottomTabBarProps, above);
 * `onPress`'s tabPress-event-then-navigate sequence mirrors the library's
 * own BottomTabBar so anything listening for that event (there isn't
 * anything today, but the built-in bar always fires it) keeps working.
 *
 * Collapse state persists across sessions the same way the library
 * filter order/theme mode/locale already do (AsyncStorage, which is
 * backed by localStorage on web) — the toggle stays reachable inside the
 * rail itself either way, matching Notion/VS Code's own icon-rail
 * collapse pattern rather than hiding it behind a hover reveal (RN's
 * Pressable has no direct mouse-hover-region concept to build that on).
 */
function Sidebar({ state, descriptors, navigation, insets }: TabBarProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);

  // One driver for the whole transition — width, and (via interpolation)
  // the fade/shrink of everything that only makes sense at full width (the
  // app icon, the nav labels). Starts at EXPANDED_WIDTH, matching the
  // default `collapsed` state above; the effect below snaps it instantly
  // to whatever was actually persisted, without animating that first
  // read-from-storage jump.
  const widthAnim = useRef(new Animated.Value(EXPANDED_WIDTH)).current;

  useEffect(() => {
    AsyncStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      .then((value) => {
        const isCollapsed = value === '1';
        setCollapsed(isCollapsed);
        widthAnim.setValue(isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH);
      })
      .catch(() => {});
    // widthAnim is a ref-backed Animated.Value, stable for the component's
    // lifetime — omitting it isn't a stale-closure risk the way a plain
    // value would be.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      AsyncStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0').catch(() => {});
      Animated.timing(widthAnim, {
        toValue: next ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        duration: TRANSITION_MS,
        easing: Easing.out(Easing.cubic),
        // Width isn't an animatable "transform/opacity" property, so the
        // native driver (available on web too, via react-native-web) can't
        // run this one — it's still smooth at this scale (a single tween,
        // not something scroll-linked).
        useNativeDriver: false,
      }).start();
      return next;
    });
  }

  // Shared fade for anything that only exists at full width — reaches 0
  // well before the rail finishes shrinking (60% of the way there) so
  // labels don't visibly clip mid-collapse; expanding is the same curve in
  // reverse, so content fades back in over the second half of that tween.
  const fadeWidth = COLLAPSED_WIDTH + (EXPANDED_WIDTH - COLLAPSED_WIDTH) * 0.4;
  const contentOpacity = widthAnim.interpolate({
    inputRange: [COLLAPSED_WIDTH, fadeWidth, EXPANDED_WIDTH],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const iconWidth = widthAnim.interpolate({
    inputRange: [COLLAPSED_WIDTH, EXPANDED_WIDTH],
    outputRange: [0, 28],
    extrapolate: 'clamp',
  });

  const toggleButton = (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
      style={({ pressed }) => [
        {
          width: 34,
          height: 34,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
        },
      ]}
    >
      <Ionicons name="menu-outline" size={20} color={theme.colors.textMuted} />
    </Pressable>
  );

  return (
    <Animated.View
      style={{
        width: widthAnim,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface,
        borderRightWidth: 1,
        borderColor: theme.colors.border,
        paddingTop: (insets?.top ?? 0) + theme.spacing.sm,
        paddingBottom: (insets?.bottom ?? 0) + theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        gap: 2,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme.spacing.sm,
        }}
      >
        <Animated.View style={{ width: iconWidth, opacity: contentOpacity, overflow: 'hidden' }}>
          <Image source={appIconAsset} style={{ width: 28, height: 28, borderRadius: theme.radius.sm }} />
        </Animated.View>
        {toggleButton}
      </View>

      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = index === state.index;
        const color = focused ? theme.colors.primaryOnSoft : theme.colors.textMuted;

        function onPress() {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: theme.radius.md,
                backgroundColor: focused ? theme.colors.primarySoft : pressed ? theme.colors.surfaceSunken : 'transparent',
              },
            ]}
          >
            {options.tabBarIcon?.({ focused, color, size: 20 })}
            <Animated.View style={{ opacity: contentOpacity }}>
              <Text
                variant="label"
                style={{ color, fontSize: 15, fontWeight: focused ? '700' : '600' }}
                numberOfLines={1}
              >
                {typeof options.title === 'string' ? options.title : route.name}
              </Text>
            </Animated.View>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}
