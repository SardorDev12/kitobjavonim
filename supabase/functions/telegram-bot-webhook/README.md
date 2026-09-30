# Telegram bot webhook

The bot's only active logic. Everything else about Telegram sign-in still
works the way `supabase/functions/telegram-auth/README.md` describes — this
function's only job is getting a `login_url` button in front of the user,
which is what makes the sign-in happen *inside Telegram itself* (native
confirm dialog, account picker if more than one Telegram account is signed
in on the device) instead of a browser tab.

## Why this exists

Telegram Bot API's `login_url` — the thing that produces the native "Log in
to Shelfie?" dialog — is a field on an inline keyboard button. Buttons only
exist on messages a bot sends. There is no way to get that dialog without
the bot actually replying to something, so this function is what makes it
reply.

## How a sign-in flows now

1. The app opens `https://t.me/<bot_username>?start=web` or `?start=native`
   (`src/features/auth/providers.ts`) — a real deep link into the Telegram
   app itself, not a page in a browser.
2. Telegram sends that `/start` command to this webhook.
3. This function replies (via the Bot API's `sendMessage`) with one button:
   a `login_url` pointing at `telegram-auth/callback`, carrying the right
   `redirect_to` (and `origin`, for native) for whichever platform the
   `start` payload said.
4. The user taps it. Telegram shows the confirm dialog, lets them pick
   which account if they have more than one active, and — on approval —
   opens the button's `url` with the signed payload appended to the query
   string. Same fields, same HMAC, as the old widget ever sent.
5. `telegram-auth/callback` verifies it exactly as before and mints a
   session. This function is not involved in that step at all.

## Deploying

```bash
supabase secrets set \
  TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32) \
  TELEGRAM_WEB_ORIGIN=https://your-app-domain.example
```

`TELEGRAM_BOT_TOKEN` and `APP_SCHEME` are already set from deploying
`telegram-auth` — this function reads the same secrets, no need to set them
twice.

```bash
supabase functions deploy telegram-bot-webhook --no-verify-jwt
```

Then point Telegram at it — this is the one step with no equivalent
anywhere else in this repo, since no other function is ever called *by*
Telegram rather than by the app:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<project-ref>.supabase.co/functions/v1/telegram-bot-webhook" \
  -d "secret_token=<the TELEGRAM_WEBHOOK_SECRET value you set above>"
```

Re-run that `setWebhook` call any time the function's URL changes (a new
Supabase project) or the secret is rotated. Telegram remembers the webhook
URL and secret indefinitely otherwise — there is nothing in this repo that
re-registers it automatically.

To check what Telegram currently has registered, or to confirm it is
actually reaching this function:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

`last_error_message` there is the fastest way to find out why a login button
isn't showing up — almost always a wrong secret_token, or this function not
deployed yet.

## Settings

| Setting | Required | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes (shared with `telegram-auth`) | Calls `sendMessage`. |
| `TELEGRAM_WEBHOOK_SECRET` | yes | Verified against Telegram's `X-Telegram-Bot-Api-Secret-Token` header on every call — without it, anyone who finds this function's URL could POST a fake update and make the bot send a login button pointed at a `redirect_to` of their choosing to an arbitrary chat id. |
| `TELEGRAM_WEB_ORIGIN` | yes | The one canonical web origin to build `login_url` targets against. Not the same as `telegram-auth`'s `TELEGRAM_ALLOWED_ORIGINS` allow-list — this function only ever originates a URL, it never validates one Telegram sends back. |
| `APP_SCHEME` | no, shared with `telegram-auth` | Deep-link scheme for the native `redirect_to`, defaults to `homelibrary`. |

## What this function deliberately does not do

It never touches the database, never sees a signed payload, and never
mints a session — `telegram-auth` still owns all of that, unchanged. If
this function is broken or undeployed, the worst case is the login button
never appears (Telegram shows `/start` was received with no reply); it
cannot itself be tricked into creating or signing in as any account, since
it has nothing that grants one.
