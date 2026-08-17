import { Ionicons } from '@expo/vector-icons';
import type { ReactNode, RefObject } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAndroidKeyboardHeight } from '@/lib/useAndroidKeyboardHeight';
import { useLayout, useTheme } from '@/theme';

import { Text } from './Text';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Caps the sheet height as a fraction of the window. */
  maxHeightRatio?: number;
  /**
   * Exposes the internal ScrollView so a caller can scroll a focused field
   * into view by hand — same reasoning as Screen's identical prop. A sheet's
   * form fields are especially at risk of this: the sheet itself is already
   * height-capped (`maxHeightRatio`), so there is even less room than a full
   * screen for a field near the bottom to stay visible above the keyboard.
   */
  scrollRef?: RefObject<ScrollView | null>;
};

/**
 * Modal panel used for pickers and short forms.
 *
 * On phones it rises from the bottom edge; past the `lg` breakpoint it becomes a
 * centred dialog, because a full-width sheet pinned to the bottom of a 27-inch
 * monitor reads as a mistake.
 */
export function Sheet({ visible, onClose, title, children, maxHeightRatio = 0.85, scrollRef }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide, height } = useLayout();
  // Same problem Screen solves and the same reason: under edge-to-edge, the
  // OS no longer shrinks the window for the keyboard, so without this a
  // field below the fold has no scroll room to be revealed into — the
  // ScrollView's content is exactly as tall as the (keyboard-capped) sheet,
  // keyboard or not.
  const keyboardHeight = useAndroidKeyboardHeight();

  return (
    <Modal visible={visible} transparent animationType={isWide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.colors.overlay }, isWide && styles.backdropCentered]}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        <Pressable
          // Swallows the press so tapping inside the panel does not dismiss it.
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              backgroundColor: theme.colors.surface,
              maxHeight: height * maxHeightRatio,
              paddingBottom: isWide ? theme.spacing.lg : insets.bottom + theme.spacing.md,
            },
            isWide
              ? {
                  width: 460,
                  borderRadius: theme.radius.xl,
                  ...theme.shadow.raised,
                }
              : {
                  width: '100%',
                  borderTopLeftRadius: theme.radius.xl,
                  borderTopRightRadius: theme.radius.xl,
                },
          ]}
        >
          {!isWide ? (
            <View style={styles.grabberWrap}>
              <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />
            </View>
          ) : null}

          {title ? (
            <View
              style={[
                styles.header,
                { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
              ]}
            >
              <Text variant="heading" style={styles.headerTitle}>
                {title}
              </Text>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{
              paddingHorizontal: theme.spacing.lg,
              paddingBottom: theme.spacing.lg + keyboardHeight,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  backdropCentered: { justifyContent: 'center', alignItems: 'center' },
  grabberWrap: { alignItems: 'center', paddingTop: 8 },
  grabber: { width: 36, height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { flex: 1 },
});
