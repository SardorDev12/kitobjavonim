import { LegalPage } from '@/components/LegalPage';
import { useI18n } from '@/lib/i18n';
import { TERMS_OF_SERVICE } from '@/lib/legalContent';

export default function TermsOfServiceScreen() {
  const { locale } = useI18n();
  return <LegalPage doc={TERMS_OF_SERVICE[locale]} />;
}
