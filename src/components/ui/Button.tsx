import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'leading' | 'trailing';
  loading?: boolean;
  /** Stretches to fill the parent — the default on phones, off on wide layouts. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

const heights: Record<Size, number> = { sm: 36, md: 46, lg: 54 };

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'leading',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const colors = {
    primary: {
      background: theme.colors.primary,
      pressed: theme.colors.primaryHover,
      text: theme.colors.textInverted,
      border: 'transparent',
    },
    secondary: {
      background: theme.colors.surface,
      pressed: theme.colors.surfaceSunken,
      text: theme.colors.text,
      border: theme.colors.borderStrong,
    },
    ghost: {
      background: 'transparent',
      pressed: theme.colors.surfaceSunken,
      text: theme.colors.primary,
      border: 'transparent',
    },
    danger: {
      background: theme.colors.dangerSoft,
      pressed: theme.colors.danger,
      text: theme.colors.danger,
      border: 'transparent',
    },
  }[variant];

  const iconNode = icon ? (
    <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={colors.text} />
  ) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          height: heights[size],
          paddingHorizontal: size === 'sm' ? theme.spacing.md : theme.spacing.lg,
          borderRadius: theme.radius.md,
          backgroundColor: pressed ? colors.pressed : colors.background,
          borderColor: colors.border,
          borderWidth: colors.border === 'transparent' ? 0 : 1,
          opacity: isDisabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <View style={styles.content}>
          {iconPosition === 'leading' ? iconNode : null}
          <Text
            variant={size === 'sm' ? 'label' : 'bodyStrong'}
            style={{ color: colors.text }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {iconPosition === 'trailing' ? iconNode : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
