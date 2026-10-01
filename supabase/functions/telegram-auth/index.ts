/**
 * Telegram sign-in — verification and session minting.
 *
 * Telegram's OpenID Connect login ("Log In With Telegram"), the flow behind the
 * native "Log in to <App>" sheet inside the Telegram app on mobile and
 * Telegram's own login page on web. Endpoints and the on-device code exchange
 * mirror Telegram's official SDKs (TelegramMessenger/telegram-login-android
 * and -ios).
 *
 *   POST /telegram-auth/oidc   → verifies the id_token, mints a session
 *
 * The id_token's signature, issuer, audience and age are checked against
 * Telegram's published keys before anything else happens: that check, not the
 * transport, is what makes the identity trustworthy. The client id is read
 * from app_config (telegram_oidc_client_id) rather than a secret, so the app
 * and this function can never disagree on it.
 *
 * Setup is documented in README.md next to this file.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'npm:jose@5.9.6';

/**
 * Telegram's OpenID Connect login ("Log In With Telegram") — the flow behind
 * the native "Log in to <App>" sheet inside the Telegram app. Endpoints and
 * the on-device code exchange mirror Telegram's own official SDKs
 * (TelegramMessenger/telegram-login-android and -ios); see POST /oidc below.
 * The client id is read from app_config (telegram_oidc_client_id) rather
 * than a secret, so the app and this function can never disagree on it and
 * the whole flow can be switched on or off with one row.
 */
const OIDC_ISSUER = 'https://oauth.telegram.org';
const OIDC_TOKEN_ENDPOINT = 'https://oauth.telegram.org/token';
const OIDC_JWKS = createRemoteJWKSet(new URL('https://oauth.telegram.org/.well-known/jwks.json'));
/** Only needed for web sign-ins, whose code is exchanged here rather than on the device. */
const OIDC_CLIENT_SECRET = Deno.env.get('TELEGRAM_OIDC_CLIENT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/**
 * Web origins allowed to sign in, comma separated — for example
 * `http://localhost:8081,https://app.kitobjavonim.uz`. Used for CORS and to
 * validate the web redirect_uri.
 */
const ALLOWED_ORIGINS = (Deno.env.get('TELEGRAM_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function createAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Inferred from the real constructor call — `ReturnType<typeof createClient>` alone resolves to a client whose tables are typed `never`. */
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Supabase's edge runtime sits behind a proxy, so the real client address is
 * only available via this header — `request.headers.get('host')` or similar
 * would just return Supabase's own infrastructure. The header is a
 * comma-separated list (client, then each proxy hop); the first entry is the
 * original client. Falls back to a constant so a missing header still buckets
 * together rather than bypassing the per-IP cap entirely.
 */
function clientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Records this attempt and checks it against both caps enforced by
 * telegram_auth_rate_limit (0038_telegram_auth_hardening.sql) — per
 * telegram_id and per client IP, independently, within a 5-minute window.
 * The insert itself IS the check: the trigger rejects it once either cap is
 * exceeded, so a successful insert always means "under both caps."
 *
 * Fails open on any error other than the rate-limit rejection itself — a
 * broken rate-limit table must never be able to lock every real user out of
 * signing in.
 */
async function isRateLimited(
  admin: AdminClient,
  telegramId: string,
  ip: string
): Promise<boolean> {
  const { error } = await admin.from('telegram_auth_attempts').insert({ telegram_id: telegramId, client_ip: ip });

  if (!error) return false;
  if (error.code === 'P0001') return true;

  console.error('telegram_auth_attempts insert failed (failing open):', error.message);
  return false;
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/oidc')) return await handleOidc(request);

  return new Response('This endpoint only verifies Telegram OpenID Connect sign-ins: POST /oidc.', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
});

// -----------------------------------------------------------------------------
// OpenID Connect
// -----------------------------------------------------------------------------

/**
 * POST /oidc — body is one of:
 *
 * - `{ id_token }` — native. The app already exchanged the code on-device
 *   (PKCE, no secret), exactly as Telegram's official Android/iOS SDKs do, and
 *   only needs the resulting token checked here.
 * - `{ code, code_verifier, redirect_uri }` — web. A browser can't hold the
 *   client secret, so the exchange happens here instead.
 *
 * Either way the id_token's signature, issuer, audience and age are verified
 * against Telegram's published keys before anything else happens — that
 * check, not the transport, is what makes the identity trustworthy. Responds
 * `{ token_hash, type }`, a one-time token the client hands to
 * supabase.auth.verifyOtp.
 */
async function handleOidc(request: Request): Promise<Response> {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('telegram-auth/oidc: Supabase environment is not available');
    return json({ error: 'Sign-in is not available right now' }, 500, cors);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400, cors);
  }

  const admin = createAdminClient();

  // Keyed per client IP rather than per Telegram id, since nothing here knows
  // the id until after verification — so the per-id cap in
  // 0038_telegram_auth_hardening.sql works out to 10 OIDC attempts per IP per
  // 5 minutes. Generous for real sign-ins, even behind a shared carrier IP.
  const ip = clientIp(request.headers);
  if (await isRateLimited(admin, `oidc:${ip}`, ip)) {
    return json({ error: 'Too many attempts — try again in a few minutes' }, 429, cors);
  }

  const clientId = await oidcClientId(admin);
  if (!clientId) return json({ error: 'Telegram sign-in is not configured' }, 503, cors);

  let idToken: string;
  if (typeof body.id_token === 'string') {
    idToken = body.id_token;
  } else if (
    typeof body.code === 'string' &&
    typeof body.code_verifier === 'string' &&
    typeof body.redirect_uri === 'string'
  ) {
    if (!isAllowedOidcWebRedirect(body.redirect_uri)) return json({ error: 'Invalid redirect' }, 400, cors);
    const exchanged = await exchangeCode(clientId, body.code, body.code_verifier, body.redirect_uri);
    if ('error' in exchanged) {
      console.error('telegram-auth/oidc: token exchange failed:', exchanged.error);
      return json({ error: 'Could not verify the Telegram response' }, 401, cors);
    }
    idToken = exchanged.idToken;
  } else {
    return json({ error: 'Invalid request' }, 400, cors);
  }

  const identity = await verifyIdToken(idToken, clientId);
  if (!identity) return json({ error: 'Could not verify the Telegram response' }, 401, cors);

  const minted = await mintSession(admin, identity);
  if ('error' in minted) {
    console.error('telegram-auth/oidc: could not mint a session:', minted.error);
    return json({ error: 'Could not start a session' }, 500, cors);
  }

  return json({ token_hash: minted.tokenHash, type: 'magiclink' }, 200, cors);
}

async function oidcClientId(admin: AdminClient): Promise<string | null> {
  const { data } = await admin.from('app_config').select('value').eq('key', 'telegram_oidc_client_id').maybeSingle();
  const value = (data as { value?: string } | null)?.value?.trim();
  return value || null;
}

/** Web sign-ins may only come back to the app's own OIDC route on an allow-listed origin. */
function isAllowedOidcWebRedirect(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ALLOWED_ORIGINS.includes(parsed.origin) && parsed.pathname === '/auth/telegram-oidc';
  } catch {
    return false;
  }
}

async function exchangeCode(
  clientId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<{ idToken: string } | { error: string }> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  };
  // Telegram's docs require the secret as HTTP Basic auth, not a body field.
  if (OIDC_CLIENT_SECRET) headers.authorization = `Basic ${btoa(`${clientId}:${OIDC_CLIENT_SECRET}`)}`;

  const response = await fetch(OIDC_TOKEN_ENDPOINT, { method: 'POST', headers, body: form });
  const text = await response.text();
  if (!response.ok) return { error: `HTTP ${response.status}: ${text}` };

  try {
    // Telegram's own SDKs accept either shape, so this does too.
    const parsed = JSON.parse(text) as { id_token?: unknown; result?: unknown };
    const idToken = typeof parsed.id_token === 'string' ? parsed.id_token : parsed.result;
    return typeof idToken === 'string' && idToken ? { idToken } : { error: 'No id_token in response' };
  } catch {
    return { error: 'Unparseable token response' };
  }
}

async function verifyIdToken(idToken: string, clientId: string): Promise<TelegramIdentity | null> {
  try {
    const { payload } = await jwtVerify(idToken, OIDC_JWKS, {
      issuer: OIDC_ISSUER,
      audience: clientId,
      algorithms: ['RS256', 'ES256', 'EdDSA'],
      // A token lifted off a device later can't be replayed into a fresh session.
      maxTokenAge: '10m',
    });
    return identityFromClaims(payload);
  } catch (error) {
    console.error('telegram-auth/oidc: id_token rejected:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Keyed on the `id` claim — Telegram's own numeric user id, the value every
 * earlier Telegram sign-in was keyed on — so an existing account
 * (tg_<id>@telegram.local) is found rather than duplicated. `sub` is
 * deliberately not used as a fallback: nothing reachable from here documents
 * it as equal to that id, and guessing wrong would map one person onto
 * someone else's account.
 */
function identityFromClaims(claims: JWTPayload): TelegramIdentity | null {
  const rawId = claims.id;
  const id =
    typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0
      ? String(rawId)
      : typeof rawId === 'string' && /^\d+$/.test(rawId)
        ? rawId
        : null;
  if (!id) {
    console.error('telegram-auth/oidc: id_token has no numeric id claim; claims present:', Object.keys(claims));
    return null;
  }

  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const displayName =
    text(claims.name) ?? [text(claims.given_name), text(claims.family_name)].filter(Boolean).join(' ');

  return {
    id,
    displayName,
    username: text(claims.preferred_username),
    photoUrl: text(claims.picture),
  };
}

/** Only allow-listed web origins get a CORS grant; native requests send no Origin at all. */
function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });
}

/** A Telegram identity that has already been verified from a signed OIDC id_token. */
type TelegramIdentity = {
  /** Telegram's numeric user id, as a string — the same value either flow yields for the same person. */
  id: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
};

/**
 * Turns a verified Telegram identity into a one-time Supabase magic-link
 * token the client exchanges for a session.
 */
async function mintSession(
  admin: AdminClient,
  identity: TelegramIdentity
): Promise<{ tokenHash: string } | { error: string }> {
  // Telegram accounts have no email address, so a stable synthetic one keyed on
  // the immutable Telegram id acts as the account identifier. The username is
  // deliberately not used for this — users can change it at any time.
  const email = `tg_${identity.id}@telegram.local`;

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: identity.displayName,
      avatar_url: identity.photoUrl,
      telegram_id: identity.id,
      telegram_username: identity.username,
    },
  });

  // "Already registered" is the ordinary case — this Telegram account has signed
  // in before. Every other error is real and must not be swallowed: treating any
  // failure as a returning user would turn a broken service-role key or an
  // unreachable database into a silent, unexplainable login failure.
  if (createError && !isAlreadyRegistered(createError)) {
    return { error: createError.message };
  }

  // generateLink hands back a one-time code the client exchanges for a real
  // session, which keeps the service-role key on the server where it belongs.
  // It also returns the user, which is how the id is obtained for both the new
  // and the returning case without paging through every account.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !link.properties?.hashed_token) {
    return { error: linkError?.message ?? 'Could not start a session' };
  }

  if (link.user?.id) {
    // telegram_id/telegram_last_login_at are bookkeeping, not user-editable
    // data, so every login overwrites them unconditionally.
    await admin
      .from('profiles')
      .update({ telegram_id: Number(identity.id), telegram_last_login_at: new Date().toISOString() })
      .eq('id', link.user.id);

    if (identity.username) {
      // `.is(null)` so a handle the user has since edited in the app is left alone.
      await admin
        .from('profiles')
        .update({ telegram_username: identity.username })
        .eq('id', link.user.id)
        .is('telegram_username', null);
    }
  }

  return { tokenHash: link.properties.hashed_token };
}

/** supabase-js has reported this differently across versions, so check all three. */
function isAlreadyRegistered(error: { message?: string; status?: number; code?: string }): boolean {
  return (
    error.code === 'email_exists' ||
    error.status === 422 ||
    /already (been )?registered|already exists/i.test(error.message ?? '')
  );
}
