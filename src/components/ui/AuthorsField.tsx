import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type NativeSyntheticEvent, type TargetedEvent } from 'react-native';

import { useAuthorSuggestions } from '@/lib/queries/library';
import { useTheme } from '@/theme';

import { Text } from './Text';
import { TextField } from './TextField';

export type AuthorsFieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  onFocus?: (event: NativeSyntheticEvent<TargetedEvent>) => void;
};

/**
 * The plain comma-separated authors TextField, with existing catalogue
 * spellings suggested for whichever name is currently being typed.
 *
 * Nudging someone toward "Chingiz Aytmatov" when they start typing "ching"
 * — rather than letting them independently retype (and inevitably
 * re-spell) an author already in the catalogue — is what actually keeps
 * `books.authors` consistent; there's no separate authors table to enforce
 * it at the database level (see 0016_search_authors.sql), so this is the
 * whole mechanism.
 *
 * Deliberately stays a single free-text field rather than becoming a
 * proper multi-select/tag input — that's a bigger redesign than "suggest a
 * name" calls for, and every existing caller (manual entry, the edit
 * sheet) already stores and parses authors as one comma-separated string.
 */
export function AuthorsField({ label, hint, value, onChangeText, onFocus }: AuthorsFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  // Only the segment after the last comma is "being typed" — everything
  // before it is already a committed author name and shouldn't trigger
  // more suggestions just because the field re-renders.
  const currentSegment = useMemo(() => {
    const lastComma = value.lastIndexOf(',');
    return (lastComma === -1 ? value : value.slice(lastComma + 1)).trim();
  }, [value]);

  // Debounced so every keystroke doesn't fire a request — search_authors is
  // cheap, but there's no reason to hit it for "c", "ch", "chi", ... in a
  // fraction of a second.
  const [debounced, setDebounced] = useState(currentSegment);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(currentSegment), 250);
    return () => clearTimeout(timer);
  }, [currentSegment]);

  const { data: suggestions } = useAuthorSuggestions(debounced);

  const alreadyEntered = useMemo(() => {
    const segments = value.split(',');
    segments.pop(); // the segment still being typed doesn't count as "already entered"
    return new Set(segments.map((name) => name.trim().toLowerCase()).filter(Boolean));
  }, [value]);

  const filtered = (suggestions ?? []).filter(
    (name) => name.toLowerCase() !== currentSegment.toLowerCase() && !alreadyEntered.has(name.toLowerCase())
  );

  function pick(name: string) {
    const lastComma = value.lastIndexOf(',');
    const prefix = lastComma === -1 ? '' : `${value.slice(0, lastComma + 1)} `;
    onChangeText(`${prefix}${name}, `);
  }

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <TextField
        label={label}
        hint={hint}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        // A tap on a suggestion below fires onPress after this field's
        // onBlur — hiding the list immediately would remove the target out
        // from under that tap. Delaying long enough for the tap to land,
        // and short enough nobody notices, is the standard fix.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />

      {focused && currentSegment.length >= 2 && filtered.length > 0 ? (
        <View
          style={[
            styles.list,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.md },
          ]}
        >
          {filtered.map((name, index) => (
            <Pressable
              key={name}
              onPress={() => pick(name)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.row,
                { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
                pressed && { backgroundColor: theme.colors.surfaceSunken },
                index > 0 && { borderTopWidth: 1, borderTopColor: theme.colors.border },
              ]}
            >
              <Text variant="body">{name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, overflow: 'hidden' },
  row: {},
});
