import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

export type RatingProps = {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: number;
  /** Display-only — no press targets, tighter spacing. */
  readOnly?: boolean;
};

export function Rating({ value, onChange, size = 28, readOnly = false }: RatingProps) {
  const theme = useTheme();
  const stars = [1, 2, 3, 4, 5];

  return (
    <View style={[styles.row, { gap: readOnly ? 2 : 6 }]} accessibilityRole="adjustable">
      {stars.map((star) => {
        const filled = value !== null && star <= value;
        const icon = filled ? 'star' : 'star-outline';
        const color = filled ? theme.colors.accent : theme.colors.textSubtle;

        if (readOnly || !onChange) {
          return <Ionicons key={star} name={icon} size={size} color={color} />;
        }

        return (
          <Pressable
            key={star}
            // Tapping the current rating clears it, so a misplaced tap is undoable
            // without hunting for a separate "remove rating" control.
            onPress={() => onChange(value === star ? null : star)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${star}`}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}
          >
            <Ionicons name={icon} size={size} color={color} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
});
