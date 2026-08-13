import { LegalPage } from '@/components/LegalPage';
import { useI18n } from '@/lib/i18n';
import { PRIVACY_POLICY } from '@/lib/legalContent';

export default function PrivacyPolicyScreen() {
  const { locale } = useI18n();
  return <LegalPage doc={PRIVACY_POLICY[locale]} />;
}
