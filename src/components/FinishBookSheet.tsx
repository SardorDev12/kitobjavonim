import { useState } from 'react';
import { View } from 'react-native';

import { Button, Sheet, Text, TextField } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useUpdateReadingProgress, useUpdateUserBook } from '@/lib/queries/library';
import { useTheme } from '@/theme';
import type { LibraryEntry } from '@/types/database';

/**
 * The page count a "finished" book never got prompted for otherwise silently
 * stays null forever — the stats page's pages-read numbers and books/pages
 * toggle have no real data behind them for that book. Every "mark as
 * finished" action in the app (book/[id].tsx's status chips, the Reading
 * tab's two finish() buttons) checks `entry.page_count` first and only
 * mounts this when it's missing; a book that already has one finishes
 * immediately, same as before, no interruption.
 *
 * Requires a page count to finish at all — there's no "skip" here, since a
 * skippable prompt is just the same silent gap one tap away. Canceling out
 * of the sheet (back/outside tap) leaves the book's status untouched.
 */
export function FinishBookSheet({ entry, onClose }: { entry: LibraryEntry | null; onClose: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const updateBook = useUpdateUserBook();
  const updateProgress = useUpdateReadingProgress();
  const [pages, setPages] = useState('');

  const parsed = Number(pages);
  const canSubmit = Number.isFinite(parsed) && parsed > 0;
  const pending = updateBook.isPending || updateProgress.isPending;

  function submit() {
    if (!entry || !canSubmit) return;
    const pageCount = Math.round(parsed);
    updateBook.mutate(
      { id: entry.id, patch: { page_count: pageCount } },
      {
        onSuccess: () => {
          updateProgress.mutate(
            {
              userBookId: entry.id,
              patch: { reading_status: 'finished', date_finished: entry.date_finished ?? new Date().toISOString().slice(0, 10) },
            },
            {
              onSuccess: () => {
                setPages('');
                onClose();
              },
            }
          );
        },
      }
    );
  }

  return (
    <Sheet visible={entry != null} onClose={onClose} title={t('reading.finishPagesTitle')}>
      <View style={{ gap: theme.spacing.lg }}>
        <Text variant="body" color="textMuted">
          {t('reading.finishPagesBody', { title: entry?.title ?? '' })}
        </Text>
        <TextField
          label={t('reading.finishPagesLabel')}
          value={pages}
          onChangeText={setPages}
          keyboardType="number-pad"
          inputMode="numeric"
          autoFocus
        />
        <Button title={t('reading.finishBook')} fullWidth loading={pending} disabled={!canSubmit} onPress={submit} />
      </View>
    </Sheet>
  );
}
