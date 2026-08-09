import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'error';
};

export function EmptyState({ icon = 'book-outline', title, body, actionLabel, onAction, tone = 'neutral' }: EmptyStateProps) {
  const theme = useTheme();
  const isError = tone === 'error';

  return (
    <View style={[styles.container, { padding: theme.spacing.xl, gap: theme.spacing.md }]}>
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: isError ? theme.colors.dangerSoft : theme.colors.surfaceSunken,
            borderRadius: theme.radius.pill,
          },
        ]}
      >
        <Ionicons
          name={isError ? 'alert-circle-outline' : icon}
          size={30}
          color={isError ? theme.colors.danger : theme.colors.textSubtle}
        />
      </View>

      <Text variant="heading" align="center">
        {title}
      </Text>

      {body ? (
        <Text variant="body" color="textMuted" align="center" style={styles.body}>
          {body}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant={isError ? 'secondary' : 'primary'} />
      ) : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { padding: theme.spacing.xl, gap: theme.spacing.md }]}>
      <ActivityIndicator color={theme.colors.primary} />
      {label ? (
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  body: { maxWidth: 340 },
});
