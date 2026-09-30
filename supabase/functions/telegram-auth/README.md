# Telegram sign-in

Telegram is not an OAuth provider, so unlike Google and Apple it cannot be
switched on from the Supabase dashboard. Three pieces stand in for that:

- **`supabase/functions/telegram-bot-webhook`** — the bot's active logic.
  Replies to `/start` with a message carrying a `login_url` button, which is
  what gets the user into Telegram's own native sign-in confirmation.
- **This function** — verifies the signed payload Telegram sends back and
  turns it into a Supabase session.
- **`src/app/auth/telegram-login.tsx`** — a small web page that exists only
  to relay a *completed* native sign-in the rest of the way into the app's
  own custom scheme. It does not render anything Telegram-branded itself.

Everything else in the app works without any of this. If you would rather
launch with email, Google and Apple only, skip this and hide the Telegram
button in `src/app/(auth)/sign-in.tsx` — nothing else depends on it.

This function used to also serve the Telegram Login Widget's HTML directly,
and separately the app used to host that widget itself in a browser tab. Both
are gone — see `telegram-bot-webhook/README.md` for how the current flow
works and why it replaced them.

## What you need first

1. **A bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot`, and
   keep the token it gives you. It looks like `123456789:AA...`.
2. **A domain linked to the bot.** Still in BotFather: `/setdomain`, pick the
   bot, and send the domain `telegram-bot-webhook` builds its `login_url`
   against — i.e. `TELEGRAM_WEB_ORIGIN` (see that function's README), wherever
   `npm run web` or your Cloudflare Pages deployment lives (for example
   `homelibrary.uz`). Telegram checks a `login_url`'s domain against this
   before honouring it, same as it always checked the old widget's embedding
   page — this is what stops someone else's bot or site from harvesting
   logins through yours.

   **This cannot be `localhost`.** Telegram does not accept `localhost` or a
   bare IP address in `/setdomain`. To test locally, either deploy the web app
   once (even to Cloudflare Pages' free `*.pages.dev` preview URL) and
   register that, or run a quick HTTPS tunnel:

   ```bash
   brew install cloudflared
   cloudflared tunnel --url http://localhost:8081
   ```

   Register the `https://*.trycloudflare.com` hostname it prints, put the same
   value in `TELEGRAM_WEB_ORIGIN` and `TELEGRAM_ALLOWED_ORIGINS` (below), and
   re-run the tunnel command whenever the hostname changes.

## Deploying

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=123456789:AA... TELEGRAM_ALLOWED_ORIGINS=http://localhost:8081
```

```bash
supabase functions deploy telegram-auth --no-verify-jwt
```

`--no-verify-jwt` is required and safe here: the caller is a signed-out user, so
there is no JWT to check. The security boundary is the HMAC verification inside
the function, not Supabase's gateway.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do
not set them yourself.

Then, in `.env` (see `.env.example` at the repo root):

```
EXPO_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot
```

That's the only Telegram-specific app env var this function's flow still
reads client-side — `signInWithTelegram` (`src/features/auth/providers.ts`)
only needs the bot's username to build the `https://t.me/<bot>?start=...`
deep link. It's public on purpose: Telegram's `t.me` links are public by
design, so there is nothing to protect by hiding it.

### Settings

| Where | Setting | Required | Purpose |
|---|---|---|---|
| Function secret | `TELEGRAM_BOT_TOKEN` | yes | From BotFather. Also the HMAC key, and what `telegram-bot-webhook` calls `sendMessage` with. |
| Function secret | `TELEGRAM_ALLOWED_ORIGINS` | for web | Comma-separated web origins allowed to receive a completed sign-in. |
| Function secret | `APP_SCHEME` | no | Deep-link scheme, defaults to `homelibrary`. Match `scheme` in `app.config.js` — the staging/preview build uses `homelibrary-staging` instead, so set this to that value on the staging project. |
| App env | `EXPO_PUBLIC_TELEGRAM_BOT_USERNAME` | yes | Bot username, without the `@`. |

`telegram-bot-webhook` has its own settings (`TELEGRAM_WEBHOOK_SECRET`,
`TELEGRAM_WEB_ORIGIN`) — see that function's README.

**`TELEGRAM_ALLOWED_ORIGINS` is a security control, not configuration.** The
callback finishes by appending a `token_hash` — exchangeable for a real session
— to `redirect_to`. Without an allow-list, anyone could send a victim to
`/telegram-auth/callback?redirect_to=https://attacker.example&...`, have them
complete a genuine Telegram login, and collect their session. Only the app's
own scheme and the origins listed here are honoured; everything else is
refused before a session is ever minted.

Add each web origin you serve from, exactly — scheme, host and port all have to
match, so `http://localhost:8081` does not cover `https://homelibrary.uz`.
Native builds need no entry here; they are covered by `APP_SCHEME`.

## How a sign-in flows

1. The app opens `https://t.me/<bot>?start=web` or `?start=native`
   (`src/features/auth/providers.ts`) — a deep link into the Telegram app
   itself, not a page this app hosts.
2. `telegram-bot-webhook` receives the resulting `/start` and replies with a
   message carrying a `login_url` button pointed at this function's
   `/callback`, with the right `redirect_to` (and `origin`, for native)
   already baked in. See that function's README for the full mechanics.
3. The user taps it, confirms in Telegram's own native dialog, and Telegram
   opens the button's `url` with the signed payload and an HMAC `hash`
   appended to the query string.
4. This function records the attempt in `telegram_auth_attempts`
   (`0038_telegram_auth_hardening.sql`) and rejects it if either the calling
   Telegram id or the client IP has made too many attempts in the last five
   minutes — before the HMAC check, so this throttles malformed requests too.
5. It recomputes the HMAC using `SHA256(bot_token)` as the key and compares it
   in constant time. A mismatch, or a payload more than five minutes old, is
   rejected — this is what prevents someone from simply calling `/callback`
   with an arbitrary Telegram id.
6. On success it finds or creates the auth user, writes `telegram_id` and
   `telegram_last_login_at` onto `profiles`, issues a one-time token, and
   redirects back to the app — straight to `/auth/callback` on web, or by way
   of `/auth/telegram-login`'s bounce-back relay on native — which exchanges
   it for a session.

## Notes on the account model

Telegram accounts have no email address, so the function derives a stable one
from the numeric Telegram id: `tg_<id>@telegram.local`. The id is used rather
than the username because usernames can be changed or released, and reusing one
would hand a stranger someone else's library.

That synthetic email makes the id-to-account mapping unique implicitly (two
Telegram ids can never collide on the same `auth.users.email`), but nothing
made it *queryable* until `0038_telegram_auth_hardening.sql` added
`profiles.telegram_id` (explicit `unique` column) and
`profiles.telegram_last_login_at` (updated on every sign-in). Run that
migration before deploying a version of this function newer than it — the
`profiles` update after `generateLink` will otherwise fail against a database
that doesn't have those columns yet.

That address is never mailed to. If you later want Telegram users to be able to
add a real email and a password, they can do it from the profile screen through
Supabase's normal email-change flow.
