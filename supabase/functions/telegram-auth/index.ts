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

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const BOT_USERNAME = Deno.env.get('TELEGRAM_BOT_USERNAME')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** How old a Telegram payload may be before it is refused. */
const MAX_AUTH_AGE_SECONDS = 300;

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

  if (url.pathname.endsWith('/callback')) {
    return await handleCallback(url);
  }

  return servewidget(url);
});

// -----------------------------------------------------------------------------
// Step 1 — the widget page
// -----------------------------------------------------------------------------

function servewidget(url: URL): Response {
  const redirectTo = url.searchParams.get('redirect_to') ?? '';
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
  if (!redirectTo) return fail('Missing redirect target', redirectTo);

  const payload: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key !== 'redirect_to') payload[key] = value;
  }

  const telegramUser = payload as unknown as TelegramUser;
  if (!telegramUser.id || !telegramUser.hash) return fail('Incomplete Telegram response', redirectTo);

  if (!(await isSignatureValid(payload))) {
    return fail('Could not verify the Telegram response', redirectTo);
  }

  const age = Math.floor(Date.now() / 1000) - Number(telegramUser.auth_date);
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

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: displayName,
      avatar_url: telegramUser.photo_url ?? null,
      telegram_id: telegramUser.id,
      telegram_username: telegramUser.username ?? null,
    },
  });

  // A duplicate simply means this Telegram account has signed in before.
  const isReturning = Boolean(createError) && !created?.user;
  if (createError && !isReturning) return fail(createError.message, redirectTo);

  if (telegramUser.username) {
    const userId = created?.user?.id ?? (await findUserIdByEmail(admin, email));
    if (userId) {
      await admin
        .from('profiles')
        .update({ telegram_username: telegramUser.username })
        .eq('id', userId)
        .is('telegram_username', null);
    }
  }

  // generateLink hands back a one-time code the client can exchange for a real
  // session, which keeps the service-role key on the server where it belongs.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkError || !link.properties?.hashed_token) {
    return fail(linkError?.message ?? 'Could not start a session', redirectTo);
  }

  const target = new URL(redirectTo);
  target.searchParams.set('token_hash', link.properties.hashed_token);
  target.searchParams.set('type', 'magiclink');

  return Response.redirect(target.toString(), 303);
}

async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string
): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers();
  return data?.users.find((user) => user.email === email)?.id ?? null;
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

function fail(message: string, redirectTo: string | null): Response {
  if (!redirectTo) return new Response(message, { status: 400 });
  const target = new URL(redirectTo);
  target.searchParams.set('error_description', message);
  return Response.redirect(target.toString(), 303);
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
