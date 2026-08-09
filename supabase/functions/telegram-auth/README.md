# Telegram sign-in

Telegram is not an OAuth provider, so unlike Google and Apple it cannot be
switched on from the Supabase dashboard. This function supplies the missing
piece: it hosts the Telegram Login Widget, verifies the signed payload Telegram
sends back, and turns it into a Supabase session.

Everything else in the app works without it. If you would rather launch with
email, Google and Apple only, skip this file and hide the Telegram button in
`src/app/(auth)/sign-in.tsx` — nothing else depends on it.

## What you need first

1. **A bot.** Message [@BotFather](https://t.me/BotFather), send `/newbot`, and
   keep the token it gives you. It looks like `123456789:AA...`.
2. **A domain linked to the bot.** Still in BotFather: `/setdomain`, pick the
   bot, and send the domain your web app is served from (for example
   `homelibrary.uz`). Telegram refuses to render the widget on any other domain,
   which is exactly what stops someone else's site from harvesting logins
   through your bot.

   During development you can point it at your Supabase functions domain
   (`<project-ref>.supabase.co`) so the widget works before you own a domain.

## Deploying

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=123456789:AA... TELEGRAM_BOT_USERNAME=your_bot
```

```bash
supabase functions deploy telegram-auth --no-verify-jwt
```

`--no-verify-jwt` is required and safe here: the caller is a signed-out user, so
there is no JWT to check. The security boundary is the HMAC verification inside
the function, not Supabase's gateway.

## How a sign-in flows

1. The app opens `/functions/v1/telegram-auth?redirect_to=<app deep link>`.
2. That page renders Telegram's widget. The user confirms in Telegram.
3. Telegram redirects to `/callback` with the user's details and an HMAC `hash`.
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
