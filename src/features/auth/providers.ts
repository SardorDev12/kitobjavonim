import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Required on web so the OAuth popup can hand control back to the opener.
WebBrowser.maybeCompleteAuthSession();

/** Where the provider sends the user once they approve. */
function redirectUri(path = 'auth/callback') {
  return Linking.createURL(path);
}

/**
 * Pulls the tokens out of the URL the auth session came back with.
 *
 * Supabase returns them in the fragment for the implicit flow and as a `code`
 * query parameter for PKCE, so both are handled here.
 */
async function completeFromUrl(url: string): Promise<void> {
  const { queryParams } = Linking.parse(url);

  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  // The Telegram function and the password-reset email both come back with a
  // one-time token hash rather than a session.
  const tokenHash = typeof queryParams?.token_hash === 'string' ? queryParams.token_hash : null;
  if (tokenHash) {
    const type = typeof queryParams?.type === 'string' ? queryParams.type : 'magiclink';
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'magiclink' | 'recovery' | 'email',
    });
    if (error) throw error;
    return;
  }

  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  const description = params.get('error_description') ?? queryParams?.error_description;
  throw new Error(typeof description === 'string' ? description : 'Sign-in was not completed');
}

/**
 * Google (and any other Supabase OAuth provider).
 *
 * On web, supabase-js performs a normal redirect and `detectSessionInUrl`
 * finishes the job. On native there is no page to redirect, so the provider URL
 * is opened in an auth session and the resulting deep link is parsed by hand.
 */
export async function signInWithOAuth(provider: 'google'): Promise<void> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectUri() },
    });
    if (error) throw error;
    return;
  }

  const redirectTo = redirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Sign-in was not completed');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // user dismissed the sheet

  await completeFromUrl(result.url);
}

/**
 * Sign in with Apple.
 *
 * The App Store requires this whenever another third-party login is offered, so
 * it exists purely because Google sign-in does. Native only — on Android and web
 * `isAvailable` is false and the button is not rendered.
 */
export async function signInWithApple(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) throw new Error('Sign-in was not completed');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Apple sends the display name exactly once, on the very first authorisation.
  // If it is not captured here it is gone for good.
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (fullName) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      // Only fills a blank name — never overwrites one the user has since set.
      await supabase
        .from('profiles')
        .update({ display_name: fullName })
        .eq('id', data.user.id)
        .eq('display_name', '');
    }
  }
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Telegram.
 *
 * Telegram has no OAuth endpoint Supabase can talk to directly: it posts a
 * signed payload to a page on a domain registered against the bot. The
 * `telegram-auth` Edge Function (supabase/functions/telegram-auth) hosts that
 * page, verifies the HMAC with the bot token, and redirects back here with a
 * one-time code. See supabase/functions/telegram-auth/README.md for setup.
 */
export async function signInWithTelegram(): Promise<void> {
  const functionsUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/telegram-auth`;
  const redirectTo = redirectUri();
  const startUrl = `${functionsUrl}?redirect_to=${encodeURIComponent(redirectTo)}`;

  if (Platform.OS === 'web') {
    globalThis.location.assign(startUrl);
    return;
  }

  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectTo);
  if (result.type !== 'success') return;

  await completeFromUrl(result.url);
}

export { completeFromUrl, redirectUri };
