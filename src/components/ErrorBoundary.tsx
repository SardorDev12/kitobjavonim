import { Component, type ReactNode } from 'react';
import { View } from 'react-native';

import { recordCrash } from '@/lib/crashReporting';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/theme';

import { EmptyState } from './ui';

/**
 * Last-resort catch for render crashes. Without this, an uncaught error
 * anywhere in the tree unmounts the whole app and leaves a blank white
 * screen — no error, no way back, nothing to screenshot. This turns that
 * into a recoverable screen.
 *
 * Must be a class component: React only recognizes componentDidCatch /
 * getDerivedStateFromError on class components, hooks have no equivalent.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportError(error, info.componentStack ?? undefined);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return <CrashFallback onRetry={this.reset} />;
    return this.props.children;
  }
}

function CrashFallback({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
      <EmptyState
        tone="error"
        title={t('error.crashTitle')}
        body={t('error.crashBody')}
        actionLabel={t('common.retry')}
        onAction={onRetry}
      />
    </View>
  );
}

/**
 * The one seam every crash and unhandled rejection in the app funnels
 * through, rather than scattered `console.error` calls.
 */
export function reportError(error: Error, componentStack?: string) {
  // eslint-disable-next-line no-console
  console.error('[reportError]', error, componentStack);
  recordCrash(error, componentStack);
}

/**
 * Catches what ErrorBoundary structurally cannot: a class component's
 * componentDidCatch only fires for errors thrown during React's render
 * phase. An error inside an event handler, an async callback, or a
 * rejected promise anywhere in the app unwinds silently instead — the UI
 * just stops responding, with nothing in the crash-reporting seam above to
 * show for it. Web-only, called once from the root layout.
 */
export function installGlobalErrorReporting() {
  const onError = (event: ErrorEvent) => {
    reportError(event.error instanceof Error ? event.error : new Error(String(event.message)));
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
