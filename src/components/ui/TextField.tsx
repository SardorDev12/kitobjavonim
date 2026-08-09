import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  /** Rendered inside the field on the trailing edge — a unit, a clear button. */
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  hint,
  error,
  trailing,
  containerStyle,
  style,
  multiline,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.primary
      : theme.colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" color="textMuted" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor,
            borderRadius: theme.radius.md,
            minHeight: multiline ? 108 : 46,
            alignItems: multiline ? 'flex-start' : 'center',
            paddingVertical: multiline ? theme.spacing.md : 0,
          },
        ]}
      >
        <TextInput
          {...rest}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={theme.colors.textSubtle}
          style={[
            styles.input,
            theme.typography.body,
            {
              color: theme.colors.text,
              paddingHorizontal: theme.spacing.md,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            style,
          ]}
        />
        {trailing ? <View style={{ paddingRight: theme.spacing.md }}>{trailing}</View> : null}
      </View>

      {error ? (
        <Text variant="caption" color="danger" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textSubtle" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { marginLeft: 2 },
  field: {
    flexDirection: 'row',
    borderWidth: 1,
  },
  input: {
    flex: 1,
    // Removes the default focus ring on web so the border colour is the only
    // focus affordance, matching native.
    outlineStyle: 'none',
  } as never,
  helper: { marginLeft: 2 },
});
