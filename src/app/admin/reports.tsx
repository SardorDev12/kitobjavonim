import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Chip, EmptyState, LoadingState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDate } from '@/lib/format';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useAdminReports, useResolveReport } from '@/lib/queries/admin';
import { useTheme } from '@/theme';
import type { AdminReport } from '@/types/database';

/**
 * Not linked from anywhere a regular user would see — reachable only by
 * URL, and profiles.is_admin (set directly in the database, never via the
 * client) is what actually gates the data: admin_list_reports() returns
 * nothing for anyone else regardless of what this screen renders. The
 * check here is just to avoid flashing a reports UI at a non-admin before
 * the empty response comes back.
 */
export default function AdminReportsScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const { data: reports, isPending } = useAdminReports();
  const resolveReport = useResolveReport();

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }

  if (!profile?.is_admin) {
    return (
      <Screen>
        <EmptyState tone="error" title={t('error.notFound')} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </Pressable>
      </View>

      <Screen scroll={!isPending}>
        {isPending ? (
          <LoadingState />
        ) : (
          <View style={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
            <Text variant="display">{t('admin.reports')}</Text>

            {!reports || reports.length === 0 ? (
              <EmptyState title={t('admin.noReports')} />
            ) : (
              <View style={{ gap: theme.spacing.md }}>
                {reports.map((report) => (
                  <ReportCard
                    key={report.report_id}
                    report={report}
                    locale={locale}
                    onResolve={() => resolveReport.mutate(report.report_id)}
                    resolving={resolveReport.isPending && resolveReport.variables === report.report_id}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </Screen>
    </View>
  );
}

function ReportCard({
  report,
  locale,
  onResolve,
  resolving,
}: {
  report: AdminReport;
  locale: 'uz' | 'ru' | 'en';
  onResolve: () => void;
  resolving: boolean;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {report.book_title}
        </Text>
        {report.resolved_at ? (
          <Chip readOnly tone="success" label={t('admin.resolved')} />
        ) : (
          // reason is free-text in the database (not a constrained enum), unlike
          // the fixed REPORT_REASONS list the report sheet itself submits from —
          // report.${string} can't narrow to MessageKey, hence the cast.
          <Chip readOnly tone="warning" label={t(`report.${report.reason}` as MessageKey)} />
        )}
      </View>

      {report.details ? (
        <Text variant="body" color="textMuted">
          {report.details}
        </Text>
      ) : null}

      <Text variant="caption" color="textSubtle">
        {t('admin.reportedBy', { name: report.reporter_name })}
      </Text>
      <Text variant="caption" color="textSubtle">
        {t('admin.listingOwner', { name: report.owner_name })}
      </Text>
      <Text variant="caption" color="textSubtle">
        {formatDate(report.created_at, locale)}
      </Text>

      {!report.resolved_at ? (
        <Button
          title={t('admin.markResolved')}
          variant="secondary"
          size="sm"
          loading={resolving}
          onPress={onResolve}
        />
      ) : null}
    </Card>
  );
}
