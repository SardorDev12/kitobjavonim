/**
 * Telegram sign-in — bot deep-link confirmation.
 *
 * Replaces the Login Widget. The widget required BotFather's /setdomain to
 * match the exact page it was embedded on — broken every time this app's
 * domain moved — and opened a phone-number-entry screen for anyone not
 * already signed into Telegram Web, which reads as suspicious to a lot of
 * users being asked to type a phone number into a page they don't fully
 * trust. This function is the other half of the replacement: the app opens
 * `https://t.me/<bot>?start=<token>`, the user taps Start, and Telegram
 * calls this webhook directly — no widget, no domain check, no phone
 * number ever typed anywhere in this flow.
 *
 *   POST /telegram-bot-webhook   ← called by Telegram itself on every
 *                                  message sent to the bot
 *
 * Trust model: unlike the widget's HMAC-signed payload (a value handed
 * through a browser redirect, so it has to be signed to prove Telegram
 * really produced it), this is a direct server-to-server call from
 * Telegram's own infrastructure. The equivalent check here is the
 * `X-Telegram-Bot-Api-Secret-Token` header, set once via `setWebhook` and
 * verified on every request — without it, anyone who found this URL could
 * post an arbitrary Telegram id and take over that account.
 *
 * Setup is documented in README.md next to this file.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** The app's deep-link scheme, matching `scheme` in app.config.js. */
const APP_SCHEME = Deno.env.get('APP_SCHEME') ?? 'homelibrary';

/**
 * This environment's deployed web app URL — e.g. https://app.kitobjavonim.uz
 * for production, https://test.kitobjavonim.uz for staging. Optional: the
 * "back to the app" button in the confirmation message just omits the web
 * option if this isn't set.
 */
const APP_WEB_URL = Deno.env.get('APP_WEB_URL') ?? '';

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const START_TOKEN_PATTERN = /^\/start\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

type TelegramInlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
};

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
};

function missingConfig(): string | null {
  if (!BOT_TOKEN) return 'TELEGRAM_BOT_TOKEN is not set';
  if (!WEBHOOK_SECRET) return 'TELEGRAM_WEBHOOK_SECRET is not set';
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return 'Supabase environment is not available';
  return null;
}

Deno.serve(async (request) => {
  const configError = missingConfig();
  if (configError) {
    return new Response(`telegram-bot-webhook is misconfigured: ${configError}`, { status: 500 });
  }

  if (request.method !== 'POST') {
    return new Response('This endpoint only accepts Telegram webhook calls.', { status: 200 });
  }

  // Constant-time-equal isn't needed here the way it is for the HMAC check
  // below: this is a fixed shared secret compared once per request, not a
  // per-request signature an attacker could nudge byte-by-byte toward a
  // match through repeated timing probes.
  if (request.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response('OK', { status: 200 }); // malformed body — nothing to retry
  }

  const chatId = update.message?.chat?.id;
  const from = update.message?.from;
  const text = update.message?.text ?? '';

  if (!chatId || !from?.id) return new Response('OK', { status: 200 });

  const match = START_TOKEN_PATTERN.exec(text);
  if (!match) {
    // Someone opened the bot directly rather than via the app's deep link —
    // Telegram still delivers this as an ordinary message.
    await sendMessage(chatId, 'Bu bot faqat Kitobjavonim ilovasidan kirish uchun ishlatiladi.');
    return new Response('OK', { status: 200 });
  }

  const token = match[1];
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: session } = await admin
    .from('telegram_login_sessions')
    .select('status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!session || session.status !== 'pending' || new Date(session.expires_at) < new Date()) {
    await sendMessage(chatId, 'Bu havola eskirgan. Ilovada qaytadan urinib ko‘ring.');
    return new Response('OK', { status: 200 });
  }

  // Telegram accounts have no email address, so a stable synthetic one keyed
  // on the immutable Telegram id acts as the account identifier. The
  // username is deliberately not used for this — users can change it at
  // any time.
  const telegramId = String(from.id);
  const email = `tg_${telegramId}@telegram.local`;
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: displayName,
      telegram_id: telegramId,
      telegram_username: from.username ?? null,
    },
  });

  // "Already registered" is the ordinary case — this Telegram account has
  // signed in before. Every other error is real and must not be swallowed.
  if (createError && !isAlreadyRegistered(createError)) {
    await sendMessage(chatId, 'Kirishda xatolik yuz berdi. Birozdan so‘ng qayta urinib ko‘ring.');
    return new Response('OK', { status: 200 });
  }

  // generateLink hands back a one-time code the client exchanges for a real
  // session via verifyOtp, which keeps the service-role key on the server
  // where it belongs. It also returns the user, which is how the id is
  // obtained for both the new and the returning case.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !link.properties?.hashed_token) {
    await sendMessage(chatId, 'Kirishda xatolik yuz berdi. Birozdan so‘ng qayta urinib ko‘ring.');
    return new Response('OK', { status: 200 });
  }

  if (from.username && link.user?.id) {
    // `.is(null)` so a handle the user has since edited in the app is left alone.
    await admin
      .from('profiles')
      .update({ telegram_username: from.username })
      .eq('id', link.user.id)
      .is('telegram_username', null);
  }

  // The pending -> confirmed transition is scoped to exactly this token and
  // still pending, so a second /start with a stale or reused token can't
  // clobber a session another request already confirmed.
  const { error: updateError } = await admin
    .from('telegram_login_sessions')
    .update({ status: 'confirmed', token_hash: link.properties.hashed_token })
    .eq('token', token)
    .eq('status', 'pending');

  if (updateError) {
    await sendMessage(chatId, 'Kirishda xatolik yuz berdi. Birozdan so‘ng qayta urinib ko‘ring.');
    return new Response('OK', { status: 200 });
  }

  await sendMessage(chatId, 'Kitobjavonimga xush kelibsiz! ⚡ Ilovaga qaytishingiz mumkin.', returnToAppButtons());
  return new Response('OK', { status: 200 });
});

/**
 * "Back to the app" buttons for the confirmation message — the app doesn't
 * need to be told the sign-in is done through this link at all (it's
 * already resolving on its own via Realtime/polling from the moment this
 * row was confirmed above), it's purely a convenience so the user doesn't
 * have to remember to switch apps/tabs back manually. The native option
 * always works if the app is installed; the web one is included only if
 * this environment has APP_WEB_URL set.
 */
function returnToAppButtons(): TelegramInlineKeyboard {
  const buttons = [{ text: '📱 Ilovaga qaytish', url: `${APP_SCHEME}://` }];
  if (APP_WEB_URL) buttons.push({ text: '🌐 Veb-saytda ochish', url: APP_WEB_URL });
  return { inline_keyboard: [buttons] };
}

/** supabase-js has reported this differently across versions, so check all three. */
function isAlreadyRegistered(error: { message?: string; status?: number; code?: string }): boolean {
  return (
    error.code === 'email_exists' ||
    error.status === 422 ||
    /already (been )?registered|already exists/i.test(error.message ?? '')
  );
}

async function sendMessage(chatId: number, text: string, replyMarkup?: TelegramInlineKeyboard): Promise<void> {
  try {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
    });
    // fetch() only throws on a network failure, not on a non-2xx response —
    // a wrong TELEGRAM_BOT_TOKEN, for instance, fails silently unless this
    // is checked and logged explicitly. Not worth failing the webhook over
    // (see the comment on the catch below), but worth being visible in this
    // function's own Supabase logs instead of just vanishing.
    if (!response.ok) {
      console.error('telegram sendMessage failed', response.status, await response.text());
    }
  } catch (cause) {
    // A failed confirmation message isn't worth failing the webhook over —
    // the session row is already updated (or wasn't, and the caller above
    // already handled that), so the app's own polling/Realtime still
    // resolves the sign-in either way.
    console.error('telegram sendMessage threw', cause);
  }
}
