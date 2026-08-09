import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Divider } from './Card';
import { Sheet } from './Sheet';
import { Text } from './Text';

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  /** Secondary line — a shelf's position count, a district's region. */
  detail?: string;
};

export type SelectProps<T extends string> = {
  label?: string;
  placeholder: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T | null) => void;
  /** Adds a "none" entry that clears the selection. */
  clearable?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  hint?: string;
  error?: string | null;
};

/**
 * A select rendered as a sheet of options.
 *
 * The PRD calls for SELECT-type inputs populated from the user's own
 * bookshelves, so this is deliberately data-driven — there are no hard-coded
 * position values anywhere in the component.
 */
export function Select<T extends string>({
  label,
  placeholder,
  value,
  options,
  onChange,
  clearable = false,
  clearLabel,
  disabled = false,
  hint,
  error,
}: SelectProps<T>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value) ?? null;

  return (
    <View style={styles.container}>
      {label ? (
        <Text variant="label" color="textMuted" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          variant="body"
          color={selected ? 'text' : 'textSubtle'}
          numberOfLines={1}
          style={styles.triggerText}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.textSubtle} />
      </Pressable>

      {error ? (
        <Text variant="caption" color="danger" style={styles.label}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textSubtle" style={styles.label}>
          {hint}
        </Text>
      ) : null}

      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? placeholder}>
        {clearable ? (
          <>
            <Option
              label={clearLabel ?? placeholder}
              selected={value === null}
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
            />
            <Divider />
          </>
        ) : null}

        {options.map((option, index) => (
          <View key={option.value}>
            <Option
              label={option.label}
              detail={option.detail}
              selected={option.value === value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
            {index < options.length - 1 ? <Divider /> : null}
          </View>
        ))}
      </Sheet>
    </View>
  );
}

function Option({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.option,
        { paddingVertical: theme.spacing.md },
        pressed && { backgroundColor: theme.colors.surfaceSunken },
      ]}
    >
      <View style={styles.optionText}>
        <Text variant={selected ? 'bodyStrong' : 'body'} color={selected ? 'primary' : 'text'}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" color="textSubtle">
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={theme.colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { marginLeft: 2 },
  trigger: {
    height: 46,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  triggerText: { flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionText: { flex: 1, gap: 2 },
});
