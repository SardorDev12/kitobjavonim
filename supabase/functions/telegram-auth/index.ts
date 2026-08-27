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
 * (`src/app/auth/telegram-login.tsx`), on a domain you control, and only the
 * signed redirect — which has no body for that rule to apply to — comes here.
 *
 * The HMAC check is the security boundary: without it, anyone could POST any
 * Telegram id here and take over that account. Payloads older than 5 minutes are
 * rejected so a captured URL cannot be replayed later.
 *
 * Setup is documented in README.md next to this file.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** The app's deep-link scheme, matching `scheme` in app.config.js. */
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

/** Redirects by hand: Response.redirect rejects non-HTTP schemes in Deno. */
function redirect(target: string): Response {
  return new Response(null, { status: 303, headers: { location: target } });
}

function missingConfig(): string | null {
  if (!BOT_TOKEN) return 'TELEGRAM_BOT_TOKEN is not set';
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return 'Supabase environment is not available';
  return null;
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
  const configError = missingConfig();
  if (configError) {
    // Surfaced as plain text rather than a redirect: this is a deploy mistake,
    // and bouncing it back into the app would disguise it as a login failure.
    return new Response(`telegram-auth is misconfigured: ${configError}`, { status: 500 });
  }

  const url = new URL(request.url);

  if (url.pathname.endsWith('/callback')) {
    return await handleCallback(url);
  }

  // Anyone hitting the base URL directly — a stale bookmark, a curl check — gets
  // an explanation rather than a 404, since this endpoint used to do more.
  return new Response(
    'This endpoint only verifies a Telegram sign-in callback. The login widget ' +
      'is hosted by the app itself at /auth/telegram-login.',
    { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } }
  );
});

// -----------------------------------------------------------------------------
// Verify the payload and mint a session
// -----------------------------------------------------------------------------

async function handleCallback(url: URL): Promise<Response> {
  const redirectTo = url.searchParams.get('redirect_to');
  if (!redirectTo || !isAllowedRedirect(redirectTo)) {
    // TEMPORARY DIAGNOSTIC — remove once the mismatch is found.
    let origin = '(unparseable)';
    try {
      origin = new URL(redirectTo ?? '').origin;
    } catch {
      // leave the placeholder
    }
    return new Response(
      `Invalid redirect target\nredirect_to origin: ${origin}\n` +
        `TELEGRAM_ALLOWED_ORIGINS raw: ${JSON.stringify(Deno.env.get('TELEGRAM_ALLOWED_ORIGINS') ?? null)}\n` +
        `Parsed allow-list: ${JSON.stringify(ALLOWED_ORIGINS)}`,
      { status: 400 }
    );
  }

  const payload: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key !== 'redirect_to') payload[key] = value;
  }

  const telegramUser = payload as unknown as TelegramUser;
  if (!telegramUser.id || !telegramUser.hash) return fail('Incomplete Telegram response', redirectTo);

  if (!(await isSignatureValid(payload))) {
    // TEMPORARY DIAGNOSTIC — remove once the mismatch is found. Never prints
    // the bot token itself, only whether it's set and the two hashes, which
    // are not secret (the received one is already plain in the URL).
    const expected = await computeExpectedHash(payload);
    return new Response(
      `Could not verify the Telegram response\n` +
        `TELEGRAM_BOT_TOKEN set: ${Boolean(BOT_TOKEN)} (length ${BOT_TOKEN.length})\n` +
        `received hash: ${payload.hash}\n` +
        `expected hash: ${expected}`,
      { status: 400 }
    );
  }

  // Math.abs so a clock skewed into the future is refused too, rather than
  // yielding a negative age that sails past the maximum.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(telegramUser.auth_date));
  if (!Number.isFinite(age) || age > MAX_AUTH_AGE_SECONDS) {
    return fail('That sign-in link has expired', redirectTo);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Telegram accounts have no email address, so a stable synthetic one keyed on
  // the immutable Telegram id acts as the account identifier. The username is
  // deliberately not used for this — users can change it at any time.
  const email = `tg_${telegramUser.id}@telegram.local`;
  const displayName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ').trim();

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: displayName,
      avatar_url: telegramUser.photo_url ?? null,
      telegram_id: telegramUser.id,
      telegram_username: telegramUser.username ?? null,
    },
  });

  // "Already registered" is the ordinary case — this Telegram account has signed
  // in before. Every other error is real and must not be swallowed: treating any
  // failure as a returning user would turn a broken service-role key or an
  // unreachable database into a silent, unexplainable login failure.
  if (createError && !isAlreadyRegistered(createError)) {
    return fail(createError.message, redirectTo);
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
    return fail(linkError?.message ?? 'Could not start a session', redirectTo);
  }

  if (telegramUser.username && link.user?.id) {
    // `.is(null)` so a handle the user has since edited in the app is left alone.
    await admin
      .from('profiles')
      .update({ telegram_username: telegramUser.username })
      .eq('id', link.user.id)
      .is('telegram_username', null);
  }

  const target = new URL(redirectTo);
  target.searchParams.set('token_hash', link.properties.hashed_token);
  target.searchParams.set('type', 'magiclink');

  return redirect(target.toString());
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
function fail(message: string, redirectTo: string | null): Response {
  if (!redirectTo) return new Response(message, { status: 400 });
  const target = new URL(redirectTo);
  target.searchParams.set('error_description', message);
  return redirect(target.toString());
}
