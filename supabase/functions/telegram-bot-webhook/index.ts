/**
 * Telegram bot webhook — the bot's first and only active logic.
 *
 * Until now @home_library_signin_bot existed purely for BotFather's domain
 * binding; nothing ever made it send a message. The native "log in inside
 * Telegram" flow (Bot API's `login_url` inline-button, as opposed to the
 * browser-based Login Widget) requires exactly that: a `login_url` button
 * only exists as part of a message the bot sends, so getting the account
 * picker and native confirm dialog means the bot has to actually reply to
 * `/start` with one.
 *
 * POST /telegram-bot-webhook   → Telegram calls this on every update once
 *                                 `setWebhook` is configured (see README.md)
 *
 * This function does not verify the login itself — that is still
 * `telegram-auth`'s job, unchanged. All this does is get a `login_url`
 * button in front of the user; the button's own `url` points straight at
 * `telegram-auth/callback`, so the signed payload that comes back afterward
 * is verified exactly the same way it always was.
 */

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
// Only used to build the callback URL below — this function never talks to
// the database itself, so no service-role key is needed here.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

/**
 * Checked against Telegram's `X-Telegram-Bot-Api-Secret-Token` header on
 * every request — the only thing stopping anyone who finds this function's
 * URL from POSTing fabricated "updates" and making the bot send arbitrary
 * login buttons (pointed at whatever redirect_to they like) to arbitrary
 * chat ids. Set via `setWebhook`'s own `secret_token` parameter — see
 * README.md.
 */
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';

/** Matches telegram-auth's own default — see that function's APP_SCHEME comment. */
const APP_SCHEME = Deno.env.get('APP_SCHEME') ?? 'homelibrary';

/**
 * The single canonical web origin to build login_url targets against —
 * deliberately not the same as telegram-auth's TELEGRAM_ALLOWED_ORIGINS
 * (a whole allow-list, since that function has to accept requests coming
 * from any of several origins). This function only ever originates a
 * request, so it needs exactly one destination to build URLs against.
 */
const WEB_ORIGIN = Deno.env.get('TELEGRAM_WEB_ORIGIN') ?? '';

function missingConfig(): string | null {
  if (!BOT_TOKEN) return 'TELEGRAM_BOT_TOKEN is not set';
  if (!WEBHOOK_SECRET) return 'TELEGRAM_WEBHOOK_SECRET is not set';
  if (!WEB_ORIGIN) return 'TELEGRAM_WEB_ORIGIN is not set';
  if (!SUPABASE_URL) return 'SUPABASE_URL is not available';
  return null;
}

type TelegramUpdate = {
  message?: {
    chat: { id: number };
    text?: string;
  };
};

Deno.serve(async (request) => {
  const configError = missingConfig();
  if (configError) {
    console.error(`telegram-bot-webhook is misconfigured: ${configError}`);
    // Still 200s: Telegram retries a non-2xx response repeatedly, and a
    // deploy-time misconfiguration is not something retrying fixes.
    return new Response('ok', { status: 200 });
  }

  if (!timingSafeEqual(request.headers.get('x-telegram-bot-api-secret-token') ?? '', WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response('ok', { status: 200 });
  }

  const message = update.message;
  const text = message?.text ?? '';
  const match = /^\/start(?:@\S+)?(?:\s+(\S+))?/.exec(text);

  // Anything that isn't a /start command — a normal message, a sticker, an
  // edited message, a callback query — is simply not this function's job.
  // Telegram only requires a 2xx to consider the update delivered.
  if (!message || !match) return new Response('ok', { status: 200 });

  const platform = match[1] === 'native' ? 'native' : 'web';
  await sendLoginButton(message.chat.id, buildLoginUrl(platform));

  return new Response('ok', { status: 200 });
});

/**
 * Builds the same `telegram-auth/callback?redirect_to=...&origin=...` URL
 * `telegram-login.tsx` used to build client-side for the widget's
 * `data-auth-url` — same target, same query params, just assembled here
 * instead, since there is no page render to assemble it from anymore.
 */
function buildLoginUrl(platform: 'web' | 'native'): string {
  const callbackUrl = `${SUPABASE_URL}/functions/v1/telegram-auth/callback`;
  const redirectTo = platform === 'native' ? `${APP_SCHEME}://auth/callback` : `${WEB_ORIGIN}/auth/callback`;

  const url = new URL(callbackUrl);
  url.searchParams.set('redirect_to', redirectTo);
  // Only native needs the bounce-back origin — telegram-auth only reads this
  // when redirect_to is the app's own custom scheme (see its finalTarget()).
  if (platform === 'native') url.searchParams.set('origin', WEB_ORIGIN);

  return url.toString();
}

async function sendLoginButton(chatId: number, loginUrl: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: 'Tap below to sign in to Shelfie.',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Log in to Shelfie',
              login_url: {
                url: loginUrl,
                // Deliberately not requested — the only data this flow needs
                // is the standard payload (name, username, photo). Asking for
                // write access is also what appears to prompt Telegram's
                // separate phone-number-sharing dialog, which nothing here
                // asks for or stores.
                request_write_access: false,
              },
            },
          ],
        ],
      },
    }),
  });

  if (!response.ok) {
    console.error('sendMessage failed:', response.status, await response.text().catch(() => ''));
  }
}

/** Same reasoning and implementation as telegram-auth's own — see that file. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
