import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, type ColorName, type TypographyVariant } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: ColorName;
  align?: TextStyle['textAlign'];
  /** Convenience for the very common "muted caption" pairing. */
  muted?: boolean;
};

export function Text({
  variant = 'body',
  color,
  muted,
  align,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const resolved: ColorName = color ?? (muted ? 'textMuted' : 'text');

  return (
    <RNText
      {...rest}
      style={[
        theme.typography[variant] as TextStyle,
        { color: theme.colors[resolved] },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
