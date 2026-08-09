# Telegram sign-in

Telegram is not an OAuth provider, so unlike Google and Apple it cannot be
switched on from the Supabase dashboard. Two pieces stand in for that:

- **`src/app/auth/telegram-login.tsx`** — hosts the actual Telegram Login
  Widget, inside the app itself.
- **This function** — verifies the signed payload Telegram sends back and
  turns it into a Supabase session. It does *not* serve the widget.

Everything else in the app works without either. If you would rather launch
with email, Google and Apple only, skip this and hide the Telegram button in
`src/app/(auth)/sign-in.tsx` — nothing else depends on it.

## Why the widget lives in the app, not here

An earlier version of this function served the widget's HTML directly, and it
looked correct in every manual check — right up until a real browser loaded
it. Supabase's shared `*.supabase.co` domain will not return `text/html` on an
ordinary GET; it substitutes `text/plain` with `X-Content-Type-Options:
nosniff`, almost certainly to stop that domain being used to host arbitrary
pages under a trusted hostname. The browser shows raw source instead of a
rendered page. `curl -I` and a HEAD request both looked fine during testing —
neither reflects what an actual page load does — which is what made this easy
to miss the first time.

There is no in-function fix for this: it is a property of the domain the
response is served from, not of what the function returns. The widget has to
run somewhere you control, which is what `/auth/telegram-login` is for. This
function's only remaining job is the part that was never affected — verifying
a redirect, which has no body for that rule to apply to.

## What you need first

1. **A bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot`, and
   keep the token it gives you. It looks like `123456789:AA...`.
2. **A domain linked to the bot.** Still in BotFather: `/setdomain`, pick the
   bot, and send the domain **the widget page itself is served from** — that
   is, wherever `npm run web` or your Cloudflare Pages deployment lives (for
   example `homelibrary.uz`). Telegram's widget script checks the embedding
   page's own domain against this before it will render, which is exactly what
   stops someone else's site from harvesting logins through your bot.

   **This cannot be `localhost`.** Telegram does not accept `localhost` or a
   bare IP address in `/setdomain` — the widget will not render at all
   against a local dev server, no matter how the app is configured. To test
   locally, either deploy the web app once (even to Cloudflare Pages' free
   `*.pages.dev` preview URL) and register that, or run a quick HTTPS tunnel:

   ```bash
   brew install cloudflared
   cloudflared tunnel --url http://localhost:8081
   ```

   Register the `https://*.trycloudflare.com` hostname it prints, put the same
   value in `EXPO_PUBLIC_WEB_ORIGIN` and `TELEGRAM_ALLOWED_ORIGINS` (below),
   and re-run the tunnel command whenever the hostname changes.

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
EXPO_PUBLIC_WEB_ORIGIN=https://your-app-domain.example
```

`EXPO_PUBLIC_TELEGRAM_BOT_USERNAME` is public on purpose — it has to appear in
the widget page's own source for Telegram's script to find it, so there is
nothing to protect by hiding it. `EXPO_PUBLIC_WEB_ORIGIN` is only read on
native; web uses its own origin automatically.

### Settings

| Where | Setting | Required | Purpose |
|---|---|---|---|
| Function secret | `TELEGRAM_BOT_TOKEN` | yes | From BotFather. Also the HMAC key. |
| Function secret | `TELEGRAM_ALLOWED_ORIGINS` | for web | Comma-separated web origins allowed to receive a completed sign-in. |
| Function secret | `APP_SCHEME` | no | Deep-link scheme, defaults to `homelibrary`. Match `scheme` in `app.json`. |
| App env | `EXPO_PUBLIC_TELEGRAM_BOT_USERNAME` | yes | Bot username, without the `@`. |
| App env | `EXPO_PUBLIC_WEB_ORIGIN` | native only | Where the widget page is deployed — must match `/setdomain`. |

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

1. The app opens `/auth/telegram-login?redirect_to=<app deep link>` — a screen
   inside the app itself, not the Edge Function.
2. That screen injects Telegram's widget script. The user confirms in Telegram.
3. Telegram redirects to `/functions/v1/telegram-auth/callback` with the user's
   details and an HMAC `hash`.
4. The function recomputes the HMAC using `SHA256(bot_token)` as the key and
   compares it in constant time. A mismatch, or a payload more than five minutes
   old, is rejected — this is what prevents someone from simply calling
   `/callback` with an arbitrary Telegram id.
5. On success it finds or creates the auth user, issues a one-time token, and
   redirects back to the app, which exchanges it for a session.

## Notes on the account model

Telegram accounts have no email address, so the function derives a stable one
from the numeric Telegram id: `tg_<id>@telegram.local`. The id is used rather
than the username because usernames can be changed or released, and reusing one
would hand a stranger someone else's library.

That address is never mailed to. If you later want Telegram users to be able to
add a real email and a password, they can do it from the profile screen through
Supabase's normal email-change flow.
