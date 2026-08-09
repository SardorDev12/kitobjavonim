import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useI18n } from '@/lib/i18n';
import { useAddListingPhoto, useDeleteListingPhoto, useOwnListingPhotos } from '@/lib/queries/photos';
import { useTheme } from '@/theme';

import { Text } from './ui';

const MAX_PHOTOS = 5;

/**
 * Condition photos for a listing.
 *
 * "The book exists, and its condition is as described" is the trust problem the
 * PRD calls out, and a photo of the actual copy is the cheapest answer to it —
 * more convincing than any condition dropdown.
 */
export function PhotoManager({ userBookId }: { userBookId: string }) {
  const theme = useTheme();
  const { t } = useI18n();

  const { data: photos } = useOwnListingPhotos(userBookId);
  const addPhoto = useAddListingPhoto();
  const deletePhoto = useDeleteListingPhoto();

  const list = photos ?? [];
  const canAddMore = list.length < MAX_PHOTOS;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="label" color="textMuted">
        {t('book.photos')}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm }}
      >
        {list.map((photo) => (
          <View key={photo.id}>
            <Image
              source={{ uri: photo.url }}
              style={[styles.photo, { borderRadius: theme.radius.md, backgroundColor: theme.colors.skeleton }]}
              contentFit="cover"
              transition={150}
            />
            <Pressable
              onPress={() => deletePhoto.mutate(photo)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.remove')}
              style={[styles.remove, { backgroundColor: theme.colors.overlay }]}
            >
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}

        {canAddMore ? (
          <Pressable
            onPress={() => addPhoto.mutate({ userBookId, sortOrder: list.length })}
            disabled={addPhoto.isPending}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.photo,
              styles.addTile,
              {
                borderRadius: theme.radius.md,
                borderColor: theme.colors.borderStrong,
                backgroundColor: theme.colors.surfaceSunken,
                opacity: pressed || addPhoto.isPending ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons
              name={addPhoto.isPending ? 'cloud-upload-outline' : 'camera-outline'}
              size={22}
              color={theme.colors.textMuted}
            />
            <Text variant="micro" color="textMuted">
              {addPhoto.isPending ? t('common.saving') : t('book.addPhoto')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {addPhoto.isError ? (
        <Text variant="caption" color="danger">
          {t('error.saveFailed')}
        </Text>
      ) : (
        <Text variant="caption" color="textSubtle">
          {Platform.OS === 'web' ? t('book.photosHintWeb') : t('book.photosHint')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: 96, height: 96 },
  addTile: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed' },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
