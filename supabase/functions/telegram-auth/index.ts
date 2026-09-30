/**
 * Telegram sign-in — verification and session minting only.
 *
 * Telegram is not an OAuth provider, so Supabase cannot talk to it the way it
 * talks to Google. Instead the Login Widget posts a signed payload to a page
 * registered against the bot, and that page hands the payload here.
 *
 *   GET  /telegram-auth/callback?...&hash=...   → verifies, mints a session,
 *                                                 redirects back to the app
 *
 * The widget itself is NOT served from here, deliberately. An earlier version
 * of this function rendered the widget's HTML page directly, and it looked
 * fine in every manual check — until a real browser requested it. Supabase's
 * shared *.supabase.co domain will not return `text/html` to a normal GET; it
 * substitutes `text/plain` with `X-Content-Type-Options: nosniff`, almost
 * certainly to stop the domain being used to host arbitrary pages under a
 * trusted hostname. The practical effect is that a browser shows the raw
 * source instead of a rendered page — which is also why HEAD requests and
 * curl without Accept-Encoding looked fine during testing: neither reflects
 * what happens on an actual page load. The widget now lives in the app itself
 * (`src/app/auth/telegram-login.tsx`), on a domain you control.
 *
 * The same restriction is why a completed native (custom-scheme) sign-in
 * bounces back through that same page rather than being redirected to
 * straight from here: Android's Chrome won't follow a server-issued redirect
 * into a non-http scheme without a fresh user gesture, which only a
 * same-document JS navigation carries, and that needs real HTML to run in —
 * see `redirect()` below.
 *
 * The HMAC check is the security boundary: without it, anyone could POST any
 * Telegram id here and take over that account. Payloads older than 5 minutes are
 * rejected so a captured URL cannot be replayed later.
 *
 * Setup is documented in README.md next to this file.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'npm:jose@5.9.6';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

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
 * The app's deep-link scheme, matching `scheme` in app.config.js — 'homelibrary'
 * for the production build. The preview/staging build uses a different scheme
 * ('homelibrary-staging'), since two apps registering the same one means
 * Android can't tell which should catch the redirect on a device with both
 * installed. Set this secret to 'homelibrary-staging' on the staging project.
 */
const APP_SCHEME = Deno.env.get('APP_SCHEME') ?? 'homelibrary';

/**
 * Web origins allowed to receive a completed sign-in, comma separated —
 * for example `http://localhost:8081,https://homelibrary.uz`.
 */
const ALLOWED_ORIGINS = (Deno.env.get('TELEGRAM_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/** How old a Telegram payload may be before it is refused. */
const MAX_AUTH_AGE_SECONDS = 300;

/**
 * Whether a `redirect_to` may be honoured.
 *
 * This is a security boundary, not tidiness. The callback finishes by appending
 * a `token_hash` — which is exchangeable for a real session — to this URL. An
 * unchecked value would let anyone send a victim to
 * `/telegram-auth?redirect_to=https://attacker.example`, have them complete a
 * genuine Telegram login, and receive their session token. So the target must be
 * the app's own scheme or an origin listed at deploy time.
 */
function isAllowedRedirect(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  // Custom schemes have no meaningful origin, so they are matched on scheme.
  if (parsed.protocol === `${APP_SCHEME}:`) return true;

  return ALLOWED_ORIGINS.includes(parsed.origin);
}

/** Whether `redirect_to` is the app's own custom scheme rather than a web origin. */
function isNativeTarget(redirectTo: string): boolean {
  try {
    return new URL(redirectTo).protocol === `${APP_SCHEME}:`;
  } catch {
    return false;
  }
}

/** Redirects by hand: Response.redirect rejects non-HTTP schemes in Deno. */
function redirect(target: string): Response {
  return new Response(null, { status: 303, headers: { location: target } });
}

function createAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Inferred from the real constructor call — `ReturnType<typeof createClient>` alone resolves to a client whose tables are typed `never`. */
type AdminClient = ReturnType<typeof createAdminClient>;

function missingConfig(): string | null {
  if (!BOT_TOKEN) return 'TELEGRAM_BOT_TOKEN is not set';
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return 'Supabase environment is not available';
  return null;
}

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

type TelegramUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
};

Deno.serve(async (request) => {
  const url = new URL(request.url);

  // Routed ahead of missingConfig(): OIDC never touches the bot token, so a
  // deployment that only uses OIDC shouldn't be refused for lacking one.
  if (url.pathname.endsWith('/oidc')) {
    return await handleOidc(request);
  }

  const configError = missingConfig();
  if (configError) {
    // Surfaced as plain text rather than a redirect: this is a deploy mistake,
    // and bouncing it back into the app would disguise it as a login failure.
    return new Response(`telegram-auth is misconfigured: ${configError}`, { status: 500 });
  }

  if (url.pathname.endsWith('/callback')) {
    return await handleCallback(url, request.headers);
  }

  // Anyone hitting the base URL directly — a stale bookmark, a curl check — gets
  // an explanation rather than a 404, since this endpoint used to do more.
  return new Response(
    'This endpoint only verifies Telegram sign-ins: /callback (Login Widget / login_url) or /oidc (OpenID Connect).',
    { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
  );
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
 * `{ token_hash, type }` for the client to hand to supabase.auth.verifyOtp,
 * the same one-time token the legacy /callback redirects with.
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
      // Same intent as MAX_AUTH_AGE_SECONDS for the legacy payload: a token
      // lifted off a device later can't be replayed into a fresh session.
      maxTokenAge: '10m',
    });
    return identityFromClaims(payload);
  } catch (error) {
    console.error('telegram-auth/oidc: id_token rejected:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Keyed on the `id` claim — Telegram's own numeric user id, the same value
 * the legacy widget payload carries — so an existing account
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

// -----------------------------------------------------------------------------
// Verify the payload and mint a session
// -----------------------------------------------------------------------------

async function handleCallback(url: URL, headers: Headers): Promise<Response> {
  const redirectTo = url.searchParams.get('redirect_to');
  if (!redirectTo || !isAllowedRedirect(redirectTo)) {
    // Deliberately not redirected: if the target is not trusted, sending
    // anything to it — including an error — is the thing being prevented.
    return new Response('Invalid redirect target', { status: 400 });
  }

  // Where a native sign-in bounces back through, since only a page on this
  // origin can run the JS that a custom-scheme navigation needs. Sent by
  // telegram-login.tsx as its own location.origin — checked against the same
  // allow-list as redirectTo, since it ends up carrying the same token_hash.
  const bounceOrigin = url.searchParams.get('origin');
  const origin = bounceOrigin && ALLOWED_ORIGINS.includes(bounceOrigin) ? bounceOrigin : null;

  const payload: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key !== 'redirect_to' && key !== 'origin') payload[key] = value;
  }

  const telegramUser = payload as unknown as TelegramUser;
  if (!telegramUser.id || !telegramUser.hash) return fail('Incomplete Telegram response', redirectTo, origin);

  const admin = createAdminClient();

  // Recorded — and capped — before the signature check itself, so a flood of
  // requests is throttled whether or not any of them turn out to be genuine.
  if (await isRateLimited(admin, telegramUser.id, clientIp(headers))) {
    return fail('Too many attempts — try again in a few minutes', redirectTo, origin);
  }

  if (!(await isSignatureValid(payload))) {
    return fail('Could not verify the Telegram response', redirectTo, origin);
  }

  // Math.abs so a clock skewed into the future is refused too, rather than
  // yielding a negative age that sails past the maximum.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(telegramUser.auth_date));
  if (!Number.isFinite(age) || age > MAX_AUTH_AGE_SECONDS) {
    return fail('That sign-in link has expired', redirectTo, origin);
  }

  const minted = await mintSession(admin, {
    id: telegramUser.id,
    displayName: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ').trim(),
    username: telegramUser.username ?? null,
    photoUrl: telegramUser.photo_url ?? null,
  });
  if ('error' in minted) return fail(minted.error, redirectTo, origin);

  return redirect(finalTarget(redirectTo, origin, { token_hash: minted.tokenHash, type: 'magiclink' }));
}

/** A Telegram identity that has already been verified — by HMAC or by a signed OIDC id_token. */
type TelegramIdentity = {
  /** Telegram's numeric user id, as a string — the same value either flow yields for the same person. */
  id: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
};

/**
 * Turns a verified Telegram identity into a one-time Supabase magic-link
 * token the client exchanges for a session. Shared by the legacy
 * widget/login_url callback and the OIDC route, so both land on the same
 * account for the same Telegram user.
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

/**
 * Where a completed (or failed) sign-in goes.
 *
 * Web targets go straight there — a plain redirect between http(s) origins
 * has no user-gesture requirement to satisfy. A native target only goes
 * straight there if there's no bounce origin to use instead (an older cached
 * build that doesn't send one yet); otherwise it goes to that origin's
 * `/auth/telegram-login`, carrying the real target as `redirect_to` again so
 * that page can finish the handoff with a JS navigation of its own.
 */
function finalTarget(redirectTo: string, origin: string | null, params: Record<string, string>): string {
  if (origin && isNativeTarget(redirectTo)) {
    const bounce = new URL('/auth/telegram-login', origin);
    bounce.searchParams.set('redirect_to', redirectTo);
    for (const [key, value] of Object.entries(params)) bounce.searchParams.set(key, value);
    return bounce.toString();
  }

  const target = new URL(redirectTo);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return target.toString();
}

/** supabase-js has reported this differently across versions, so check all three. */
function isAlreadyRegistered(error: { message?: string; status?: number; code?: string }): boolean {
  return (
    error.code === 'email_exists' ||
    error.status === 422 ||
    /already (been )?registered|already exists/i.test(error.message ?? '')
  );
}

/**
 * Telegram's documented check: build a newline-joined `key=value` list of every
 * field except `hash`, sorted by key, and HMAC it with SHA256(bot_token).
 */
async function isSignatureValid(payload: Record<string, string>): Promise<boolean> {
  const { hash } = payload;
  if (!hash) return false;

  const expected = await computeExpectedHash(payload);
  return timingSafeEqual(expected, hash);
}

async function computeExpectedHash(payload: Record<string, string>): Promise<string> {
  const { hash: _hash, ...fields } = payload;

  const dataCheckString = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');

  const encoder = new TextEncoder();
  const secret = await crypto.subtle.digest('SHA-256', encoder.encode(BOT_TOKEN));

  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(dataCheckString));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison so the HMAC cannot be guessed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Callers reach this only after `redirectTo` has been checked against the allow-list. */
function fail(message: string, redirectTo: string | null, origin: string | null): Response {
  if (!redirectTo) return new Response(message, { status: 400 });
  return redirect(finalTarget(redirectTo, origin, { error_description: message }));
}
