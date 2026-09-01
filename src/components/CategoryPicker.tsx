import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '@/lib/i18n';
import { useCreateCategory } from '@/lib/queries/categories';
import { useCategoryOptions } from '@/lib/queries/reference';
import { useTheme } from '@/theme';

import { Chip, Text, TextField } from './ui';

/**
 * Multi-select over the category taxonomy, plus a way to add to it.
 *
 * Categories live on the shared `books` record, so tagging a book helps everyone
 * who owns a copy — and, more to the point, is what makes the category filter on
 * the Exchange screen return anything at all. The 6 seeded ones (0022_custom_categories.sql)
 * don't cover every shelf, so "+ New" resolves a typed name to an existing
 * category (built-in or someone else's, case-insensitively) or creates one —
 * see find_or_create_category() and useCreateCategory.
 */
export function CategoryPicker({
  selected,
  onChange,
  label,
  max = 3,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  label?: string;
  /** Beyond a handful, a category stops narrowing anything down. */
  max?: number;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const options = useCategoryOptions();
  const createCategory = useCreateCategory();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const atLimit = selected.length >= max;

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((id) => id !== value));
      return;
    }
    if (atLimit) return;
    onChange([...selected, value]);
  }

  async function confirmNew() {
    const name = newName.trim();
    if (!name || atLimit) {
      setCreating(false);
      setNewName('');
      return;
    }
    setCreating(false);
    setNewName('');
    try {
      const id = await createCategory.mutateAsync(name);
      if (!selected.includes(id)) onChange([...selected, id]);
    } catch {
      // The category options list itself surfaces this — nothing to add if
      // the RPC failed, so there is nothing further to reconcile here.
    }
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {label ? (
        <Text variant="label" color="textMuted">
          {label}
        </Text>
      ) : null}

      <View style={styles.chips}>
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <Chip
              key={option.value}
              label={option.label}
              selected={isSelected}
              // Unselected chips stop responding once the cap is reached, rather
              // than silently doing nothing on press.
              onPress={atLimit && !isSelected ? undefined : () => toggle(option.value)}
            />
          );
        })}

        {!creating && !atLimit ? (
          <Chip label={t('book.newCategory')} icon="add-outline" onPress={() => setCreating(true)} />
        ) : null}
      </View>

      {creating ? (
        <TextField
          value={newName}
          onChangeText={setNewName}
          placeholder={t('book.newCategoryPlaceholder')}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={confirmNew}
          onBlur={confirmNew}
          maxLength={40}
          trailing={
            <Pressable onPress={confirmNew} hitSlop={8}>
              <Text variant="label" color="primary">
                {t('common.add')}
              </Text>
            </Pressable>
          }
        />
      ) : null}

      {atLimit ? (
        <Text variant="caption" color="textSubtle">
          {t('book.categoryLimit', { count: max })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
