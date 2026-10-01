# Telegram sign-in

Telegram's OpenID Connect login ("Log In With Telegram"): on mobile the
Telegram app itself shows a native "Log in to <App>" sheet with an account
picker, and on web Telegram's own login page asks for confirmation in the app.

The flow is the same one Telegram's official SDKs use
(`TelegramMessenger/telegram-login-android` / `-ios`), reimplemented in
`src/features/auth/telegramOidc.ts` since there's no React Native SDK. On
native, the app asks `oauth.telegram.org/crossapp` for a `tg://` link and opens
it, Telegram shows its sheet, and the user comes back to the app with a code.
The app exchanges that code on the device (PKCE, no secret) for a signed
`id_token`, and this function's `POST /oidc` checks the token's signature
against Telegram's published keys (issuer, audience, max 10 min old) before
creating the session. Web does the same through `oauth.telegram.org/auth`; its
code is exchanged here instead, with the client secret as HTTP Basic auth.
Accounts are matched on the token's numeric `id` claim, so a person always
lands on the same account.

The app uses this only when `app_config` has a `telegram_oidc_client_id` row,
checked on every tap, so it can be turned on or off without an app update or
redeploy. Without the row, tapping the Telegram button shows an error.

### Setup

Use a dedicated bot for this (the current one is `@kitobjavonim_kirish_bot`).
Telegram user ids are global, so accounts match across bots.

1. **Create the bot.** In [@BotFather](https://t.me/BotFather), `/newbot`.
   Give it the name users should see (e.g. `Shelfie`) and set its profile
   photo to the app icon, since the sign-in sheet shows the app's name and
   icon.
2. **Register the app.** Open BotFather **as a Mini App** (the "Open" button in
   the BotFather chat, not the text commands) → pick the new bot →
   **Bot Settings → Login Widget** (some guides call it "Web Login"). Labels
   may differ slightly.
   - **Android:** package name `uz.homelibrary.app`, and the **SHA-256
     fingerprint of the Play App Signing key** (Play Console → the app →
     Test and release → Setup → App integrity → App signing → "App signing
     key certificate"). Redirect URI: `homelibrary://auth/telegram-oidc`.
   - **Web:** allowed URL `https://app.kitobjavonim.uz`, redirect URL
     `https://app.kitobjavonim.uz/auth/telegram-oidc`.
   - Copy the **Client ID** and the **Client Secret**. The secret is not the
     bot token.
3. **Secret.** In Supabase → Edge Functions → Secrets, add
   `TELEGRAM_OIDC_CLIENT_SECRET` = the Client Secret (used only for web
   sign-ins).
4. **Deploy** this function (`telegram-auth`) so `/oidc` exists.
5. **Turn it on** in the SQL editor:

   ```sql
   insert into app_config (key, value) values ('telegram_oidc_client_id', '<Client ID>')
   on conflict (key) do update set value = excluded.value;
   ```

   To turn it off: `delete from app_config where key = 'telegram_oidc_client_id';`

**Verified app link (Android).** With the custom-scheme redirect, Telegram
can't prove the login returns to this app and labels it "Unverified App".
BotFather's Native Login entry shows an App URL
(`https://app2863632339-login.tg.dev`), and builds from 0.5.4 claim it as a
verified App Link (`app.config.js` intent filter; see
`src/features/auth/telegramAppLink.ts`). Once 0.5.4 is installed, switch it on:

```sql
insert into app_config (key, value) values ('telegram_oidc_native_redirect', 'https://app2863632339-login.tg.dev/tglogin')
on conflict (key) do update set value = excluded.value;
```

If sign-in then opens a browser instead of returning to the app, Android
didn't verify the link (usually the registered SHA-256 isn't the Play App
Signing key). Delete the row to go back to the custom scheme.

After the first real sign-in, check that it reused the existing account and
didn't create a new one. Sign in with a Telegram account that already has a
profile, then confirm that `profiles.telegram_id` for that same profile got a
fresh `telegram_last_login_at`.

## Settings

| Where | Setting | Purpose |
|---|---|---|
| Function secret | `TELEGRAM_OIDC_CLIENT_SECRET` | The Client Secret from BotFather's Login Widget page. Used only for web sign-ins. |
| Function secret | `TELEGRAM_ALLOWED_ORIGINS` | Comma-separated web origins (e.g. `https://app.kitobjavonim.uz`). Used for CORS and to validate the web redirect URL. |
| `app_config` | `telegram_oidc_client_id` | The Client ID. Turns the flow on. |
| `app_config` | `telegram_oidc_native_redirect` | Optional, Android only: the verified App Link (see above). |

Deploy with `supabase functions deploy telegram-auth --no-verify-jwt`: the
caller is signed out, so there's no JWT to check; the security boundary is the
`id_token` verification.

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
