import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { goToTab } from '@/features/tabs/activeTab';
import type { LegalDoc } from '@/lib/legalContent';
import { useTheme } from '@/theme';

import { BackHeader, Screen, Text } from './ui';

/**
 * Shared renderer for the privacy policy and terms pages. Custom header
 * rather than the native Stack one, matching book/[id] and listing/[id]:
 * these pages need to work opened directly (an app-store listing, a link
 * from sign-up before there's any in-app history), where the default back
 * button that only appears with history to pop would be missing.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const theme = useTheme();
  const router = useRouter();

  function goBack() {
    if (router.canGoBack()) router.back();
    else {
      router.replace('/(tabs)');
      goToTab('profile');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <BackHeader onBack={goBack} />

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
