import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, Text } from '@/components/ui';
import { setPendingBook } from '@/features/add/pendingBook';
import { lookupByIsbn } from '@/lib/books/metadata';
import { isValidIsbn, normalizeIsbn } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

/**
 * ISBN scanner — the "under 10 seconds" path from the PRD.
 *
 * Book barcodes are EAN-13, and a book's EAN *is* its ISBN-13, so no conversion
 * is needed beyond a checksum sanity check.
 */
export default function ScanScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<'scanning' | 'looking-up' | 'not-found'>('scanning');
  const [lastIsbn, setLastIsbn] = useState<string | null>(null);

  // The camera fires continuously while a barcode is in frame. Without a latch,
  // one book would trigger dozens of lookups and a stack of pushed screens.
  const busy = useRef(false);

  const handleScan = useCallback(
    async ({ data }: { data: string }) => {
      if (busy.current) return;

      const isbn = normalizeIsbn(data);
      if (!isValidIsbn(isbn)) return;

      busy.current = true;
      setLastIsbn(isbn);
      setStatus('looking-up');

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      const candidate = await lookupByIsbn(isbn);

      if (candidate) {
        setPendingBook(candidate);
        router.replace('/add/configure');
        return;
      }

      setStatus('not-found');
      busy.current = false;
    },
    [router]
  );

  function addManually() {
    setPendingBook(null);
    router.replace({ pathname: '/add/manual', params: lastIsbn ? { isbn: lastIsbn } : undefined });
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <EmptyState
          icon="barcode-outline"
          title={t('add.scan')}
          body={t('add.scanUnavailable')}
          actionLabel={t('add.manual')}
          onAction={addManually}
        />
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.colors.background }]}>
        <EmptyState
          icon="camera-outline"
          title={t('add.cameraPermission')}
          body={t('add.cameraPermissionBody')}
          actionLabel={t('add.grantPermission')}
          onAction={requestPermission}
        />
        <View style={{ padding: theme.spacing.lg }}>
          <Button title={t('add.manual')} variant="ghost" fullWidth onPress={addManually} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
        onBarcodeScanned={status === 'scanning' ? handleScan : undefined}
      />

      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.overlayTop}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.reticleWrap}>
          <View style={[styles.reticle, status === 'looking-up' && { borderColor: theme.colors.accent }]} />
        </View>

        <View style={[styles.overlayBottom, { gap: theme.spacing.md }]}>
          {status === 'looking-up' ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.overlayText}>{t('add.scanLookup', { isbn: lastIsbn ?? '' })}</Text>
            </View>
          ) : status === 'not-found' ? (
            <>
              <Text style={styles.overlayText}>{t('add.scanNotFound')}</Text>
              <View style={[styles.actions, { gap: theme.spacing.sm }]}>
                <Button title={t('add.manual')} onPress={addManually} />
                <Button
                  title={t('common.retry')}
                  variant="secondary"
                  onPress={() => {
                    setStatus('scanning');
                    busy.current = false;
                  }}
                />
              </View>
            </>
          ) : (
            <Text style={styles.overlayText}>{t('add.scanHint')}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between' },
  overlayTop: { paddingHorizontal: 16, alignItems: 'flex-end' },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleWrap: { alignItems: 'center', justifyContent: 'center' },
  reticle: {
    width: '75%',
    aspectRatio: 1.9,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
  },
  overlayBottom: { paddingHorizontal: 24, alignItems: 'center' },
  overlayText: { color: '#fff', textAlign: 'center', fontSize: 15, fontWeight: '500' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row' },
});
