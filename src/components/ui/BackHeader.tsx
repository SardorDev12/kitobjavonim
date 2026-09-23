import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/lib/i18n';
import { useLayout, useTheme } from '@/theme';

/**
 * Back-button header for a screen that opts out of the native Stack header
 * (`headerShown: false`) in favor of this one — rendered as its own sibling
 * above `<Screen>`, the same shape `book/[id].tsx` established. That's
 * needed because `Screen` deliberately doesn't take a header prop (see its
 * own comment on a flex:1-sibling header measuring 0 height on a real
 * Android device), so a screen that wants one hand-rolls it above `Screen`
 * instead. Rendered there, it doesn't get `Screen`'s own maxContentWidth
 * centering for free — capped and centered here the same way, so the back
 * button (and `right`, if given) land above the same edges as the content
 * below instead of sitting at the true page edges on wide web. Also used
 * to replace the native header entirely on screens where its default back
 * chevron just sat flush to the real browser edge, uncapped, while
 * everything below it was centered — the same mismatch book/[id].tsx had
 * before its own fix.
 */
export function BackHeader({ onBack, right }: { onBack?: () => void; right?: ReactNode }) {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { maxContentWidth } = useLayout();
  const insets = useSafeAreaInsets();

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) router.back();
  }

  return (
    <View
      style={[
        styles.outer,
        { paddingTop: insets.top + theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
      ]}
    >
      <View style={[styles.inner, { width: '100%', maxWidth: maxContentWidth }]}>
        <Pressable onPress={handleBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </Pressable>

        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { alignItems: 'center' },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
