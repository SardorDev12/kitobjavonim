import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { base64ToBase64Url, randomStringFromBytes } from './pkce';

/**
 * Telegram's OpenID Connect login — the flow behind the native "Log in to
 * <App>" sheet (with its account picker) inside the Telegram app itself.
 *
 * Native mirrors Telegram's own official SDKs (TelegramMessenger/
 * telegram-login-android and -ios) step for step, since there is no React
 * Native SDK: ask oauth.telegram.org/crossapp for a `tg://` link, open it so
 * Telegram shows its sheet, get the user sent back to this app's own
 * `auth/telegram-oidc` route with a `code`, and exchange that code on-device
 * (PKCE, no secret) for a signed id_token. If Telegram isn't installed, the
 * same request goes through oauth.telegram.org/auth in a browser sheet
 * instead. Web can't do the exchange itself (it would need the client
 * secret), so it hands the code to the telegram-auth Edge Function instead.
 *
 * Either way the Edge Function verifies the id_token against Telegram's
 * published keys and returns the same one-time token_hash the rest of the
 * app already knows how to turn into a session.
 */

const OAUTH_BASE = 'https://oauth.telegram.org';
const SCOPE = 'openid profile';
const PENDING_KEY = 'auth.telegramOidc.pending';
/** A half-finished sign-in older than this is abandoned rather than resumed. */
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

type Pending = {
  clientId: string;
  redirectUri: string;
  verifier: string;
  /** Web only — Telegram's own SDKs send no state on native. */
  state?: string;
  createdAt: number;
};

/**
 * The client id of the bot registered for OIDC in BotFather, or null if none
 * is configured — in which case Telegram sign-in keeps using the older
 * bot-chat flow. Lives in app_config, not an env var, so the switch-over
 * needs no rebuild or redeploy (see supabase/functions/telegram-auth/README.md).
 */
export async function getTelegramOidcClientId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'telegram_oidc_client_id')
    .maybeSingle();
  if (error) throw error;
  return data?.value?.trim() || null;
}

function redirectUri(): string {
  return Platform.OS === 'web'
    ? `${globalThis.location.origin}/auth/telegram-oidc`
    : Linking.createURL('auth/telegram-oidc');
}

export async function startTelegramOidc(clientId: string): Promise<void> {
  const verifier = randomStringFromBytes(Crypto.getRandomBytes(64));
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  const redirect = redirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: redirect,
    code_challenge: base64ToBase64Url(digest),
    code_challenge_method: 'S256',
  });

  if (Platform.OS === 'web') {
    const state = randomStringFromBytes(Crypto.getRandomBytes(32));
    await savePending({ clientId, redirectUri: redirect, verifier, state, createdAt: Date.now() });
    params.set('state', state);
    globalThis.location.assign(`${OAUTH_BASE}/auth?${params.toString()}`);
    return;
  }

  await savePending({ clientId, redirectUri: redirect, verifier, createdAt: Date.now() });

  const tgUrl = await fetchCrossAppUrl(params);
  if (tgUrl) {
    try {
      // Returns once Telegram is in front; the result arrives later as a
      // deep link into src/app/auth/telegram-oidc.tsx.
      await Linking.openURL(tgUrl);
      return;
    } catch {
      // Rejects when no app handles tg:// — Telegram isn't installed.
    }
  }

  const result = await WebBrowser.openAuthSessionAsync(`${OAUTH_BASE}/auth?${params.toString()}`, redirect);
  if (result.type === 'success') {
    await completeTelegramOidc(Linking.parse(result.url).queryParams ?? {});
  }
}

/** Exactly what Telegram's SDKs do first: trade the request for a tg:// link that opens the native sheet. */
async function fetchCrossAppUrl(params: URLSearchParams): Promise<string | null> {
  const query = new URLSearchParams(params.toString());
  query.set(Platform.OS === 'ios' ? 'ios_sdk' : 'android_sdk', '1');
  try {
    const response = await fetch(`${OAUTH_BASE}/crossapp?${query.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { url?: unknown; result?: { url?: unknown } };
    const url = typeof body.url === 'string' ? body.url : body.result?.url;
    return typeof url === 'string' && url ? url : null;
  } catch {
    return null;
  }
}

export type TelegramOidcOutcome = 'signed-in' | 'cancelled' | 'already-handled';

// On Android a browser-sheet fallback delivers the same redirect twice: once
// to openAuthSessionAsync's promise and once to the router as a deep link.
// A code can only be exchanged once, so whichever arrives second stands down.
const handledCodes = new Set<string>();

export async function completeTelegramOidc(params: Record<string, unknown>): Promise<TelegramOidcOutcome> {
  const param = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined);

  const error = param('error');
  if (error) {
    await AsyncStorage.removeItem(PENDING_KEY);
    // Declining in Telegram is a choice, not a failure — just go back.
    if (error === 'access_denied') return 'cancelled';
    throw new Error(param('error_description') ?? error);
  }

  const code = param('code');
  if (!code) throw new Error('Sign-in was not completed');
  if (handledCodes.has(code)) return 'already-handled';
  handledCodes.add(code);

  const pending = await takePending();
  if (!pending) throw new Error('This sign-in has expired — please try again.');
  if (pending.state !== undefined && pending.state !== param('state')) {
    throw new Error('Sign-in was not completed');
  }

  const body =
    Platform.OS === 'web'
      ? { code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri }
      : { id_token: await exchangeOnDevice(code, pending) };

  const { data, error: invokeError } = await supabase.functions.invoke<{ token_hash?: string }>(
    'telegram-auth/oidc',
    { body }
  );
  if (invokeError || !data?.token_hash) {
    throw new Error((await functionErrorMessage(invokeError)) ?? 'Sign-in was not completed');
  }

  const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' });
  if (otpError) throw otpError;
  return 'signed-in';
}

/** Mirrors the official SDKs' exchangeCode: public client, PKCE only, no secret. */
async function exchangeOnDevice(code: string, pending: Pending): Promise<string> {
  const response = await fetch(`${OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: pending.clientId,
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.verifier,
    }).toString(),
  });
  if (!response.ok) throw new Error('Could not verify the Telegram response');

  const parsed = (await response.json()) as { id_token?: unknown; result?: unknown };
  const idToken = typeof parsed.id_token === 'string' ? parsed.id_token : parsed.result;
  if (typeof idToken !== 'string' || !idToken) throw new Error('Could not verify the Telegram response');
  return idToken;
}

async function functionErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (context?.json) {
    try {
      const body = (await context.json()) as { error?: unknown };
      if (typeof body.error === 'string') return body.error;
    } catch {
      // Not JSON — fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : null;
}

async function savePending(pending: Pending): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

async function takePending(): Promise<Pending | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  await AsyncStorage.removeItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as Pending;
    return Date.now() - pending.createdAt <= PENDING_MAX_AGE_MS ? pending : null;
  } catch {
    return null;
  }
}
