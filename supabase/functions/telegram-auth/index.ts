/**
 * Telegram sign-in.
 *
 * Telegram is not an OAuth provider, so Supabase cannot talk to it the way it
 * talks to Google. Instead the Login Widget posts a signed payload back to a
 * page hosted on a domain that has been registered against the bot. This
 * function is that page, and the verifier behind it.
 *
 *   GET  /telegram-auth?redirect_to=<app url>   → serves the widget page
 *   GET  /telegram-auth/callback?...&hash=...   → verifies, mints a session,
 *                                                 redirects back to the app
 *
 * The HMAC check is the security boundary: without it, anyone could POST any
 * Telegram id here and take over that account. Payloads older than 5 minutes are
 * rejected so a captured URL cannot be replayed later.
 *
 * Setup is documented in README.md next to this file.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const BOT_USERNAME = Deno.env.get('TELEGRAM_BOT_USERNAME') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** The app's deep-link scheme, matching `scheme` in app.json. */
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
  if (!BOT_USERNAME) return 'TELEGRAM_BOT_USERNAME is not set';
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

  return serveWidget(url);
});

// -----------------------------------------------------------------------------
// Step 1 — the widget page
// -----------------------------------------------------------------------------

function serveWidget(url: URL): Response {
  const redirectTo = url.searchParams.get('redirect_to') ?? '';

  // Rejected here as well as in the callback, so a bad target fails before the
  // user has bothered to confirm anything in Telegram.
  if (!redirectTo || !isAllowedRedirect(redirectTo)) {
    return new Response(
      'This sign-in link is not valid for this app. Check TELEGRAM_ALLOWED_ORIGINS and APP_SCHEME.',
      { status: 400 }
    );
  }

  const callbackUrl = new URL(url);
  callbackUrl.pathname = `${url.pathname.replace(/\/$/, '')}/callback`;
  callbackUrl.search = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Continue with Telegram</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        background: #f7f3ea; color: #231e18;
      }
      @media (prefers-color-scheme: dark) { body { background: #17130f; color: #f3ede2; } }
      main { text-align: center; padding: 24px; display: grid; gap: 16px; justify-items: center; }
      p { margin: 0; opacity: .7; font-size: 15px; }
    </style>
  </head>
  <body>
    <main>
      <p>Confirm your Telegram account to continue.</p>
      <script
        async
        src="https://telegram.org/js/telegram-widget.js?22"
        data-telegram-login="${escapeHtml(BOT_USERNAME)}"
        data-size="large"
        data-userpic="false"
        data-auth-url="${escapeHtml(callbackUrl.toString())}"
        data-request-access="write"
      ></script>
    </main>
  </body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// -----------------------------------------------------------------------------
// Step 2 — verify the payload and mint a session
// -----------------------------------------------------------------------------

async function handleCallback(url: URL): Promise<Response> {
  const redirectTo = url.searchParams.get('redirect_to');
  if (!redirectTo || !isAllowedRedirect(redirectTo)) {
    // Deliberately not redirected: if the target is not trusted, sending
    // anything to it — including an error — is the thing being prevented.
    return new Response('Invalid redirect target', { status: 400 });
  }

  const payload: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key !== 'redirect_to') payload[key] = value;
  }

  const telegramUser = payload as unknown as TelegramUser;
  if (!telegramUser.id || !telegramUser.hash) return fail('Incomplete Telegram response', redirectTo);

  if (!(await isSignatureValid(payload))) {
    return fail('Could not verify the Telegram response', redirectTo);
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
  const { hash, ...fields } = payload;
  if (!hash) return false;

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

  const expected = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return timingSafeEqual(expected, hash);
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
