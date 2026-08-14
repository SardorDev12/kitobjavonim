import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/lib/i18n';
import type { LegalDoc } from '@/lib/legalContent';
import { useTheme } from '@/theme';

import { Screen, Text } from './ui';

/**
 * Shared renderer for the privacy policy and terms pages. Custom header
 * rather than the native Stack one, matching book/[id] and listing/[id]:
 * these pages need to work opened directly (an app-store listing, a link
 * from sign-up before there's any in-app history), where the default back
 * button that only appears with history to pop would be missing.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </Pressable>
      </View>

      <Screen scroll>
        <View style={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.xl }}>
          <View style={{ gap: 4 }}>
            <Text variant="display">{doc.title}</Text>
            <Text variant="caption" color="textSubtle">
              {doc.updated}
            </Text>
          </View>

          <Text variant="body" color="textMuted">
            {doc.intro}
          </Text>

          {doc.sections.map((section) => (
            <View key={section.heading} style={{ gap: theme.spacing.sm }}>
              <Text variant="heading">{section.heading}</Text>
              {section.body.map((paragraph) => (
                <Text key={paragraph.slice(0, 40)} variant="body" color="textMuted">
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </Screen>
    </View>
  );
}
