import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookCover } from '@/components/BookCover';
import { ListingSheet } from '@/components/ListingSheet';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ListRow,
  LoadingState,
  Screen,
  Sheet,
  Text,
  TextField,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { hasContactMethod } from '@/lib/contactMethod';
import { describeError } from '@/lib/errors';
import { formatAuthors, formatDate, formatPrice } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useUpdateUserBook } from '@/lib/queries/library';
import { useListing, useListingPhotos, useReportListing, useRequestContact } from '@/lib/queries/listings';
import { useLocationOptions } from '@/lib/queries/reference';
import { useTheme } from '@/theme';
import type { ContactChannel, ContactDetails } from '@/types/database';

export default function ListingDetailScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();

  const { data: listing, isPending, isError, refetch, isRefetching } = useListing(id);
  const { data: photos } = useListingPhotos(id);
  const locations = useLocationOptions();
  const updateListing = useUpdateUserBook();

  const [contactOpen, setContactOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Same fix as book/[id].tsx: a page loaded directly (deep link, browser
  // refresh) has no in-app history to pop, so router.back() alone would do
  // nothing.
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/discover');
  }

  // Unlike book/[id].tsx's private library entry, this page's own URL is
  // already the public, shareable one — no branching on listed/unlisted.
  async function shareListing() {
    setMenuOpen(false);
    if (!listing) return;

    const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
    if (!webOrigin) return;

    const byline = listing.authors.length > 0 ? ` — ${formatAuthors(listing.authors)}` : '';
    const url = `${webOrigin}/listing/${listing.id}`;
    const message = `${listing.title}${byline}\n${url}`;

    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title: listing.title, text: `${listing.title}${byline}`, url });
        } catch {
          // AbortError when the user cancels the native share sheet — not a failure.
        }
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        globalThis.alert(t('book.shareCopied'));
      }
      return;
    }

    await Share.share({ message, url });
  }

  const header = (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
      ]}
    >
      <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
      </Pressable>

      {listing ? (
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.more')}>
          <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </View>
  );

  if (isPending) {
    return (
      <View style={styles.flex}>
        {header}
        <Screen>
          <LoadingState />
        </Screen>
      </View>
    );
  }

  if (isError || !listing) {
    return (
      <View style={styles.flex}>
        {header}
        <Screen>
          <EmptyState tone="error" title={t('error.notFound')} />
        </Screen>
      </View>
    );
  }

  const isOwn = user?.id === listing.user_id;
  const isSale = listing.availability_type === 'sale' || listing.availability_type === 'exchange_or_sale';
  const isExchange =
    listing.availability_type === 'exchange' || listing.availability_type === 'exchange_or_sale';
  const location = locations.describe(listing.owner_district_id, listing.owner_region_id);

  return (
    <View style={styles.flex}>
      {header}

      <Screen scroll onRefresh={refetch} refreshing={isRefetching}>
      <View style={{ gap: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
        <View style={[styles.hero, { gap: theme.spacing.lg }]}>
          <BookCover uri={listing.cover_url} title={listing.title} width={120} radius={theme.radius.md} />

          <View style={styles.heroText}>
            <Text variant="title">{listing.title}</Text>
            {listing.subtitle ? (
              <Text variant="body" color="textMuted">
                {listing.subtitle}
              </Text>
            ) : null}
            {listing.authors.length > 0 ? (
              <Text variant="body" color="textMuted">
                {formatAuthors(listing.authors)}
              </Text>
            ) : null}

            <View style={[styles.chips, { marginTop: theme.spacing.sm }]}>
              {isExchange ? (
                <Chip readOnly tone="primary" icon="swap-horizontal" label={t('discover.type.exchange')} />
              ) : null}
              {listing.condition ? <Chip readOnly label={t(`condition.${listing.condition}`)} /> : null}
            </View>

            {isSale && listing.sale_price !== null ? (
              <Text variant="title" color="primary" style={{ marginTop: theme.spacing.sm }}>
                {formatPrice(listing.sale_price, locale, listing.sale_currency)}
                {listing.price_negotiable ? (
                  <Text variant="caption" color="textMuted">
                    {'  '}
                    {t('book.negotiable')}
                  </Text>
                ) : null}
              </Text>
            ) : null}
          </View>
        </View>

        {photos && photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.sm }}>
            {photos.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={[styles.photo, { borderRadius: theme.radius.md, backgroundColor: theme.colors.skeleton }]}
                contentFit="cover"
                transition={150}
              />
            ))}
          </ScrollView>
        ) : null}

        {isExchange && listing.exchange_preferences ? (
          <Card>
            <Text variant="label" color="textMuted">
              {t('discover.wants')}
            </Text>
            <Text variant="body" style={{ marginTop: 4 }}>
              {listing.exchange_preferences}
            </Text>
          </Card>
        ) : null}

        {isSale && listing.sale_description ? (
          <Card>
            <Text variant="label" color="textMuted">
              {t('book.saleDescription')}
            </Text>
            <Text variant="body" style={{ marginTop: 4 }}>
              {listing.sale_description}
            </Text>
          </Card>
        ) : null}

        <Card>
          <View style={[styles.owner, { gap: theme.spacing.md }]}>
            <Avatar uri={listing.owner_avatar_url} name={listing.owner_name} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{listing.owner_name}</Text>
              {location ? (
                <Text variant="caption" color="textMuted">
                  {location}
                </Text>
              ) : null}
              {listing.listed_at ? (
                <Text variant="caption" color="textSubtle">
                  {formatDate(listing.listed_at, locale)}
                </Text>
              ) : null}
            </View>
          </View>

          {isOwn ? (
            <>
              <Text variant="caption" color="textMuted" align="center" style={{ marginTop: theme.spacing.md }}>
                {t('discover.ownListing')}
              </Text>
              <Button
                title={t('book.editListing')}
                icon="pricetag-outline"
                variant="secondary"
                fullWidth
                style={{ marginTop: theme.spacing.sm }}
                onPress={() => setListingOpen(true)}
              />
            </>
          ) : (
            <Button
              title={t('discover.contactOwner')}
              icon="chatbubble-ellipses-outline"
              fullWidth
              style={{ marginTop: theme.spacing.md }}
              onPress={() => setContactOpen(true)}
            />
          )}
        </Card>

        {listing.publisher || listing.publication_year || listing.isbn13 ? (
          <View style={{ gap: 4 }}>
            <Text variant="label" color="textMuted">
              {t('book.about')}
            </Text>
            <Text variant="caption" color="textSubtle">
              {[listing.publisher, listing.publication_year, listing.isbn13].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}
      </View>

      <ContactSheet
        visible={contactOpen}
        onClose={() => setContactOpen(false)}
        userBookId={listing.id}
        signedIn={Boolean(user)}
        onSignIn={() => {
          setContactOpen(false);
          router.push('/(auth)/sign-in');
        }}
      />

      <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} userBookId={listing.id} />

      {isOwn ? (
        <ListingSheet
          // Listing (unlike LibraryEntry) carries no updated_at to key on —
          // this reconstructs the same "reset the form after a save" effect
          // from the fields the sheet actually seeds its state from.
          key={[
            listing.availability_type,
            listing.sale_price,
            listing.price_negotiable,
            listing.exchange_preferences,
            listing.sale_description,
          ].join('|')}
          visible={listingOpen}
          onClose={() => setListingOpen(false)}
          entry={listing}
          canList={hasContactMethod(profile)}
          onOpenProfile={() => {
            setListingOpen(false);
            router.push('/settings/profile');
          }}
          onSave={(patch) => updateListing.mutateAsync({ id: listing.id, patch })}
        />
      ) : null}
      </Screen>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <ListRow
          icon="share-outline"
          label={t('common.share')}
          onPress={() => {
            void shareListing();
          }}
        />
        {!isOwn && user ? (
          <>
            <Divider inset={theme.spacing.lg} />
            <ListRow
              icon="flag-outline"
              label={t('discover.report')}
              onPress={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

// -----------------------------------------------------------------------------

/**
 * Contact owner.
 *
 * Nothing here reads a phone number out of the listing, because the listing does
 * not carry one. Picking a channel calls request_contact(), which checks the
 * caller is signed in, records the tap, and only then returns the details — so
 * the metric and the disclosure cannot drift apart.
 */
function ContactSheet({
  visible,
  onClose,
  userBookId,
  signedIn,
  onSignIn,
}: {
  visible: boolean;
  onClose: () => void;
  userBookId: string;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const requestContact = useRequestContact();

  const [details, setDetails] = useState<ContactDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reveal(channel: ContactChannel) {
    setError(null);

    try {
      const result = await requestContact.mutateAsync({ userBookId, channel });
      setDetails(result);

      if (!result) return;

      if (channel === 'telegram' && result.telegram_username) {
        await Linking.openURL(`https://t.me/${result.telegram_username}`);
      } else if (channel === 'phone' && result.phone) {
        await Linking.openURL(`tel:${result.phone}`);
      }
    } catch (cause) {
      setError(describeError(cause, t));
    }
  }

  if (!signedIn) {
    return (
      <Sheet visible={visible} onClose={onClose} title={t('discover.contactOwner')}>
        <View style={{ gap: theme.spacing.lg }}>
          <Text variant="body" color="textMuted">
            {t('discover.loginToContactBody')}
          </Text>
          <Button title={t('discover.loginToContact')} fullWidth onPress={onSignIn} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('discover.contactOwner')}>
      <View style={{ gap: theme.spacing.md }}>
        <Text variant="body" color="textMuted">
          {t('discover.contactVia')}
        </Text>

        <Button
          title={t('discover.viaTelegram')}
          icon="paper-plane-outline"
          variant="secondary"
          fullWidth
          loading={requestContact.isPending}
          onPress={() => reveal('telegram')}
        />

        <Button
          title={t('discover.viaPhone')}
          icon="call-outline"
          variant="secondary"
          fullWidth
          loading={requestContact.isPending}
          onPress={() => reveal('phone')}
        />

        {/* Shown as text as well as opened, because tel: and t.me links are
            unreliable on desktop browsers where no handler is registered. */}
        {details ? (
          <Card style={{ marginTop: theme.spacing.sm }}>
            <Text variant="bodyStrong">{details.owner_name}</Text>
            {details.telegram_username ? (
              <Text variant="body" color="primary" selectable style={{ marginTop: 4 }}>
                @{details.telegram_username}
              </Text>
            ) : null}
            {details.phone ? (
              <Text variant="body" color="primary" selectable style={{ marginTop: 4 }}>
                {details.phone}
              </Text>
            ) : null}
            {!details.telegram_username && !details.phone ? (
              <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>
                {t('discover.ownerHasNoContact')}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

// -----------------------------------------------------------------------------

const REPORT_REASONS = ['not_available', 'wrong_condition', 'spam', 'offensive', 'other'] as const;

function ReportSheet({
  visible,
  onClose,
  userBookId,
}: {
  visible: boolean;
  onClose: () => void;
  userBookId: string;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const report = useReportListing();

  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    if (!reason) return;
    await report.mutateAsync({ userBookId, reason, details: details.trim() || undefined });
    setSubmitted(true);
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t('discover.report')}>
      {submitted ? (
        <View style={{ gap: theme.spacing.lg }}>
          <Text variant="body">{t('discover.reportSubmitted')}</Text>
          <Button title={t('common.close')} fullWidth onPress={onClose} />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.lg }}>
          <Text variant="body" color="textMuted">
            {t('discover.reportReason')}
          </Text>

          <View style={styles.chips}>
            {REPORT_REASONS.map((value) => (
              <Chip
                key={value}
                label={t(`report.${value}`)}
                selected={reason === value}
                onPress={() => setReason(value)}
              />
            ))}
          </View>

          <TextField value={details} onChangeText={setDetails} multiline placeholder={t('common.optional')} />

          <Button
            title={t('common.done')}
            fullWidth
            disabled={!reason}
            loading={report.isPending}
            onPress={submit}
          />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8 },
  heroText: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  owner: { flexDirection: 'row', alignItems: 'center' },
  photo: { width: 120, height: 120 },
});
