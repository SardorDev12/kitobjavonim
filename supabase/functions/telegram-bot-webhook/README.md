# Telegram sign-in

Telegram is not an OAuth provider, so unlike Google and Apple it cannot be
switched on from the Supabase dashboard. This uses a bot deep link rather
than Telegram's Login Widget:

- **`src/app/auth/telegram-login.tsx`** — creates a pending session row,
  hands the user off to `https://t.me/<bot>?start=<token>`, and waits for
  this function to confirm it.
- **This function** — Telegram calls it directly (a webhook, not a page
  load) whenever someone messages the bot. It verifies the `/start <token>`
  payload, mints a session, and replies in the chat.

Everything else in the app works without either. If you would rather launch
with email, Google and Apple only, skip this and hide the Telegram button in
`src/app/(auth)/sign-in.tsx` — nothing else depends on it.

## Why not the Login Widget

An earlier version of this used Telegram's Login Widget, embedded on a page
this app hosted. Two real problems with that, not just preference:

1. **Domain lock.** The widget checks the *embedding page's own domain*
   against whatever was registered for the bot via BotFather's
   `/setdomain`, so every time this app moved domains (and it moved more
   than once), sign-in broke until someone remembered to re-register it.
2. **Looks like phishing.** Anyone not already signed into Telegram Web hit
   a phone-number-entry screen inside that popup — typing a phone number
   into a page embedded by a third-party site is exactly the kind of thing
   users are (rightly) trained to be suspicious of.

A bot deep link has neither problem: there is no domain check at all (the
confirmation happens inside the user's own already-authenticated Telegram
app, via a bot they message directly), and a phone number is never asked
for anywhere in the flow.

## What you need first

1. **A bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot`,
   and keep the token it gives you. It looks like `123456789:AA...`. (If
   you already have one from the widget-based setup, it's the same bot —
   nothing about the bot itself changes, only how sign-in reaches it.)
2. **No `/setdomain` needed.** Unlike the widget, this flow never embeds
   anything on a web page Telegram has to trust — skip that step entirely.

## Deploying

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=123456789:AA... TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

```bash
supabase functions deploy telegram-bot-webhook --no-verify-jwt
```

`--no-verify-jwt` is required and safe here: the caller is Telegram's own
servers, which never carry a Supabase JWT. The security boundary is the
`X-Telegram-Bot-Api-Secret-Token` header check inside the function, not
Supabase's gateway.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically —
do not set them yourself.

Then register the webhook with Telegram (once, or again whenever the
function's URL or the secret changes):

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<project-ref>.supabase.co/functions/v1/telegram-bot-webhook" \
  -d "secret_token=<the TELEGRAM_WEBHOOK_SECRET value>"
```

Finally, in `.env` (see `.env.example` at the repo root):

```
EXPO_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot
```

Public on purpose — it has to appear in the deep link
(`https://t.me/<username>?start=<token>`) the app builds, so there is
nothing to protect by hiding it.

### Settings

| Where | Setting | Required | Purpose |
|---|---|---|---|
| Function secret | `TELEGRAM_BOT_TOKEN` | yes | From BotFather. Also used to call `sendMessage`. |
| Function secret | `TELEGRAM_WEBHOOK_SECRET` | yes | Shared secret Telegram echoes back on every webhook call — the actual auth boundary for this function. |
| App env | `EXPO_PUBLIC_TELEGRAM_BOT_USERNAME` | yes | Bot username, without the `@`. Used to build the deep link. |

## How a sign-in flows

1. The app inserts a row into `telegram_login_sessions` (migration
   `0022_telegram_login_sessions.sql`) and gets back a random `token`.
2. It opens `https://t.me/<bot>?start=<token>` — on a phone this switches
   to the Telegram app; on desktop, to Telegram Desktop or Web, whichever
   the OS/browser resolves the link to.
3. The user taps **Start**. Telegram delivers `/start <token>` to this
   function as a webhook call — no browser, no redirect, no widget.
4. This function verifies the secret header, looks up the token, mints a
   session via `generateLink`, and updates the row to
   `status = 'confirmed'` with the resulting `token_hash`. It also replies
   in the chat confirming sign-in.
5. Meanwhile the app has been watching that row (Supabase Realtime, with a
   short-interval poll as a fallback in case Realtime is ever
   misconfigured for an environment). The moment it sees `confirmed`, it
   calls `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` and
   the user is signed in — still inside the app the whole time, no
   redirect back from anywhere.

## Notes on the account model

Telegram accounts have no email address, so the function derives a stable
one from the numeric Telegram id: `tg_<id>@telegram.local`. The id is used
rather than the username because usernames can be changed or released, and
reusing one would hand a stranger someone else's library.

That address is never mailed to. If you later want Telegram users to be
able to add a real email and a password, they can do it from the profile
screen through Supabase's normal email-change flow.
