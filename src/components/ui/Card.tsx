import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export function Card({
  children,
  style,
  padded = true,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();

  const cardStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: theme.radius.lg,
      padding: padded ? theme.spacing.lg : 0,
      overflow: 'hidden',
    },
    style,
  ];

  if (!onPress) return <View style={cardStyle}>{children}</View>;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cardStyle, pressed && { opacity: 0.8 }]}>
      {children}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.border, marginLeft: inset }} />;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.sectionHeader, { marginBottom: theme.spacing.sm }]}>
      <Text variant="heading">{title}</Text>
      {action}
    </View>
  );
}

/** A tappable settings-style row: label on the left, value and chevron right. */
export function ListRow({
  label,
  value,
  icon,
  onPress,
  destructive = false,
  trailing,
}: {
  label: string;
  value?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  destructive?: boolean;
  trailing?: ReactNode;
}) {
  const theme = useTheme();
  const color = destructive ? theme.colors.danger : theme.colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [
        styles.row,
        { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.lg },
        pressed && { backgroundColor: theme.colors.surfaceSunken },
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color={destructive ? color : theme.colors.textMuted} /> : null}
      <Text variant="body" style={[styles.rowLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text variant="body" color="textMuted" numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      ) : null}
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textSubtle} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { flex: 1 },
  rowValue: { maxWidth: '45%' },
});
