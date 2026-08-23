import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useI18n } from '@/lib/i18n';
import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { useTheme } from '@/theme';

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
 */
export default function TabsLayout() {
  const theme = useTheme();
  const { t } = useI18n();
  // Under edge-to-edge, opening the keyboard on a screen inside a tab (e.g.
  // Discover's search field) doesn't shrink the window — the tab bar stays
  // rendered at its usual spot at the true bottom of the screen, which the
  // keyboard then just draws over. Lifting it by the keyboard's height keeps
  // it reachable instead of hidden underneath.
  const keyboardHeight = useKeyboardHeight();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          ...(keyboardHeight > 0 ? { transform: [{ translateY: -keyboardHeight }] } : null),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen
        name="reading"
        options={{
          title: t('reading.tabLabel'),
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
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
