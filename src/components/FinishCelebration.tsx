import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { dismissCelebration, useCelebratedBook } from '@/features/reading/celebration';
import { useI18n } from '@/lib/i18n';
import { useUpdateReadingProgress } from '@/lib/queries/library';
import { useTheme } from '@/theme';

import { Button, Text } from './ui';

const CONFETTI_COUNT = 14;
const CONFETTI_COLORS = ['#E0C179', '#C9A24B', '#5CAF8E', '#1F5C4A', '#F5EBD3'];

/**
 * A short "you finished a book" moment: a check badge that pops in with a
 * burst of gilt-and-green dots, a congratulation, and tappable stars so the
 * rating — which readers are most willing to give right now — takes one tap.
 * Mounted once (see (tabs)/_layout.tsx) and driven by features/reading/
 * celebration.ts, so it shows no matter which screen finished the book.
 */
export function FinishCelebration() {
  const book = useCelebratedBook();
  const theme = useTheme();
  const { t } = useI18n();
  const updateProgress = useUpdateReadingProgress();

  const pop = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const [rating, setRating] = useState(0);

  // Fixed per-dot angle/distance so the burst is even, not random each time.
  const dots = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        angle: (i / CONFETTI_COUNT) * Math.PI * 2,
        distance: 70 + (i % 3) * 18,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + (i % 3) * 2,
      })),
    []
  );

  useEffect(() => {
    if (!book) return;
    setRating(0);
    pop.setValue(0);
    burst.setValue(0);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [book, pop, burst]);

  if (!book) return null;

  function rate(stars: number) {
    setRating(stars);
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    updateProgress.mutate({ userBookId: book!.id, patch: { rating: stars } });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissCelebration} statusBarTranslucent>
      <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surfaceRaised, borderRadius: theme.radius.xl, padding: theme.spacing.xl, gap: theme.spacing.md },
          ]}
        >
          <View style={styles.badgeArea}>
            {dots.map((dot, i) => (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  width: dot.size,
                  height: dot.size,
                  borderRadius: dot.size / 2,
                  backgroundColor: dot.color,
                  opacity: burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                  transform: [
                    { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(dot.angle) * dot.distance] }) },
                    { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(dot.angle) * dot.distance] }) },
                  ],
                }}
              />
            ))}
            <Animated.View
              style={[
                styles.badge,
                { backgroundColor: theme.colors.primary, transform: [{ scale: pop }], opacity: pop },
              ]}
            >
              <Ionicons name="checkmark" size={44} color={theme.colors.textInverted} />
            </Animated.View>
          </View>

          <Text variant="title" align="center">
            {t('celebration.title')}
          </Text>
          <Text variant="body" color="textMuted" align="center" numberOfLines={3}>
            {t('celebration.body', { title: book.title })}
          </Text>

          <View style={{ alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
            <Text variant="caption" color="textSubtle">
              {t('celebration.ratePrompt')}
            </Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable
                  key={star}
                  onPress={() => rate(star)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${star}`}
                >
                  <Ionicons
                    name={star <= rating ? 'star' : 'star-outline'}
                    size={34}
                    color={star <= rating ? theme.colors.accent : theme.colors.textSubtle}
                  />
                </Pressable>
              ))}
            </View>
          </View>

          <Button title={t('common.done')} fullWidth onPress={dismissCelebration} style={{ marginTop: theme.spacing.sm }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, alignItems: 'stretch' },
  badgeArea: { height: 110, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  stars: { flexDirection: 'row', gap: 8 },
});
