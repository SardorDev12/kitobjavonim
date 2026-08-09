import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/lib/i18n';
import { useCategoryOptions } from '@/lib/queries/reference';
import { useTheme } from '@/theme';

import { Chip, Text } from './ui';

/**
 * Multi-select over the category taxonomy.
 *
 * Categories live on the shared `books` record, so tagging a book helps everyone
 * who owns a copy — and, more to the point, is what makes the category filter on
 * the Exchange screen return anything at all.
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

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((id) => id !== value));
      return;
    }
    if (selected.length >= max) return;
    onChange([...selected, value]);
  }

  const atLimit = selected.length >= max;

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
      </View>

      {atLimit ? (
        <Text variant="caption" color="textSubtle">
          {t('book.categoryLimit', { count: max })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
