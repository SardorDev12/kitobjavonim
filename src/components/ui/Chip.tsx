import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Static badge rather than a control — renders without press feedback. */
  readOnly?: boolean;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
};

export function Chip({ label, selected = false, onPress, icon, readOnly = false, tone = 'neutral' }: ChipProps) {
  const theme = useTheme();

  const toneColors = {
    neutral: { bg: theme.colors.surfaceSunken, fg: theme.colors.textMuted },
    primary: { bg: theme.colors.primarySoft, fg: theme.colors.primaryOnSoft },
    success: { bg: theme.colors.successSoft, fg: theme.colors.success },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warning },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
  }[tone];

  const background = selected ? theme.colors.primary : toneColors.bg;
  const foreground = selected ? theme.colors.textInverted : toneColors.fg;

  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: background,
          borderRadius: theme.radius.pill,
          paddingVertical: readOnly ? 4 : 8,
          paddingHorizontal: readOnly ? 8 : 14,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={readOnly ? 12 : 14} color={foreground} /> : null}
      <Text variant={readOnly ? 'micro' : 'label'} style={{ color: foreground }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (readOnly || !onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {content}
    </Pressable>
  );
}

/** Horizontally scrolling row of chips — filters, statuses, categories. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg }}
      style={styles.row}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pressed: { opacity: 0.7 },
  row: { flexGrow: 0 },
});
