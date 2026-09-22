import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useI18n } from '@/lib/i18n';
import { useLayout, useTheme } from '@/theme';

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
 * `tabBarPosition` below switches the bar itself from bottom to a left
 * sidebar at the same `isWide` breakpoint every other screen already uses
 * to widen its own content (see useLayout()'s own doc comment — "tablet
 * and up, safe to show ... a sidebar" was written for exactly this).
 * Expo Router's Tabs navigator supports this natively (it's a vendored
 * fork of @react-navigation/bottom-tabs, not a custom component here) —
 * `tabBarPosition: 'left'` alone repositions the same icons/labels/active
 * state into a vertical rail, including its own label-beside-icon layout,
 * without a second bespoke sidebar component to keep in sync with the
 * tab list. `tabBarLabelPosition` is set explicitly rather than left to
 * the library's own auto-heuristic (which switches at a hardcoded 768px,
 * not this app's own 900px `lg` breakpoint) so the two thresholds can't
 * disagree right around the boundary.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  const { isWide } = useLayout();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarPosition: isWide ? 'left' : 'bottom',
        tabBarLabelPosition: isWide ? 'beside-icon' : 'below-icon',
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: theme.colors.background },
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
