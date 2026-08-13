# Setting up Supabase

Start to finish, roughly 20 minutes. Steps 1–5 get the app fully working with
email sign-in. Steps 6–8 are the social logins, and you can add them later.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and click **New project**.
2. **Name**: anything — `home-library`.
3. **Database password**: generate one and save it in your password manager. You
   will not be shown it again, and you need it for direct database access and
   for backups.
4. **Region**: **Frankfurt (eu-central-1)**. It is the closest free-tier region
   to Uzbekistan; picking a US region adds roughly 150 ms to every request.
5. **Plan**: Free.

Provisioning takes a couple of minutes. The free tier allows two active
projects, so don't burn one on a throwaway.

---

## 2. Run the migrations

Open **SQL Editor** in the left sidebar → **New query**.

Run these files one at a time, **in order**. Paste the whole file, press Run,
wait for "Success", then move to the next:

| # | File | What it creates |
|---|---|---|
| 1 | `supabase/migrations/0001_init.sql` | Tables, enums, indexes, triggers |
| 2 | `supabase/migrations/0002_views.sql` | `listings`, `library_entries`, `public_profiles` |
| 3 | `supabase/migrations/0003_rls.sql` | Row level security + `request_contact()` |
| 4 | `supabase/migrations/0004_storage.sql` | Avatar and listing-photo buckets |
| 5 | `supabase/migrations/0005_seed_reference.sql` | 14 regions, 61 districts, 20 categories |
| 6 | `supabase/migrations/0006_category_permissions.sql` | Narrows who may classify a book |
| 7 | `supabase/migrations/0007_library_entries_book_owner.sql` | Exposes `book_created_by` for the "edit book details" flow |
| 8 | `supabase/migrations/0008_plans_and_limits.sql` | `profiles.plan`, freemium limits (Free/Pro tiers) |
| 9 | `supabase/migrations/0009_raise_plan_caps.sql` | Raises both plans to 100 listings / 100 contacts for the pre-launch phase |
| 10 | `supabase/migrations/0010_contact_visibility.sql` | Adds `profiles.show_telegram`, gating Telegram visibility the same way `show_phone` already gates the phone number |

**Order matters** — each file references objects the previous one created.

### If one fails

The SQL editor wraps each run in a transaction, so a single failed statement
rolls back **the entire file**. That is good news: there is no half-applied
state to clean up. Fix the cause, run the same file again from the top.

It also means a failure is silent downstream — if `0001` fails and you carry on
to `0002`, everything after it fails too, and the app behaves as though the
database is empty. Check for "Success" after each one.

### Verify before moving on

```sql
select
  (select count(*) from information_schema.tables where table_schema = 'public')  as tables,
  (select count(*) from information_schema.views  where table_schema = 'public')  as views,
  (select count(*) from pg_policies where schemaname = 'public')                  as policies,
  (select count(*) from locations  where level = 'region')                        as regions,
  (select count(*) from locations  where level = 'district')                      as districts,
  (select count(*) from categories)                                               as categories;
```

Expected (after all 8 migrations, verified against a fresh throwaway
Postgres instance): **16 tables, 4 views, 22 policies, 14 regions, 61
districts, 20 categories.** Anything short of that means a migration did
not apply.

Then check the buckets exist — **Storage** in the sidebar should list `avatars`
and `book-photos`.

---

## 3. Get your API keys

**Project Settings → API** (newer dashboards: **Project Settings → API Keys**).

You need two values:

- **Project URL** — `https://<project-ref>.supabase.co`
- **anon / public key** — a long JWT. Newer projects may call this the
  **publishable** key; either works.

> **Never use the `service_role` / secret key in the app.** It bypasses every
> RLS policy in the database. It belongs only in Edge Function secrets. The anon
> key is *meant* to be public — RLS is what protects your data, which is why the
> policies in `0003` matter as much as they do.

---

## 4. Point the app at the project

```bash
cp .env.example .env
```

Edit `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

**Restart the dev server afterwards.** Expo reads env vars at startup, so an
already-running server keeps the old values. If a stale value seems stuck:

```bash
npx expo start --clear
```

---

## 5. Configure email auth

**Authentication → Providers → Email** — enabled by default.

While developing, turn **Confirm email** off. Otherwise every test account needs
a round trip through your inbox before you can sign in. Turn it back on before
launch.

**Authentication → URL Configuration**:

- **Site URL**: `http://localhost:8081`
- **Redirect URLs** — add each of these:
  ```
  http://localhost:8081/**
  homelibrary://**
  ```
  Add your production domain the same way when you deploy.

The `homelibrary://` entry is the app's deep-link scheme (`app.json` → `scheme`).
Without it, sign-in on a real phone completes in the browser and never returns
to the app.

### Try it

```bash
npm run web
```

Create an account, get through onboarding, add a book by title. If that works
end to end, the backend is correct and everything below is optional.

Supabase's built-in mailer is limited to a few messages per hour and is not for
production. Before launch, set up SMTP under **Project Settings → Auth → SMTP**
— Resend and Brevo both have usable free tiers.

---

## 6. Google sign-in

In [Google Cloud Console](https://console.cloud.google.com):

1. Create a project.
2. **APIs & Services → OAuth consent screen** → External. Fill in app name and
   support email. While it is in Testing mode only accounts you list can sign
   in, so add your own.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Under **Authorized redirect URIs** add exactly:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
5. Copy the **Client ID** and **Client secret**.

Then in Supabase: **Authentication → Providers → Google** → enable, paste both,
save.

---

## 7. Sign in with Apple

Only needed for the iOS App Store — and there, **required**: offering Google
sign-in without also offering Apple is a rejection. Needs a paid Apple Developer
account ($99/year).

**Authentication → Providers → Apple** in Supabase, then follow their setup for
the Services ID and key. The app already declares `usesAppleSignIn` and hides
the button anywhere it is unavailable, so nothing changes in the code.

---

## 8. Telegram sign-in

Telegram is not an OAuth provider and cannot be enabled from the dashboard.
Full setup is in `supabase/functions/telegram-auth/README.md` — worth reading
before you start, because the architecture is not what you'd expect: the login
widget is hosted **by the app itself**, at `/auth/telegram-login`, not by the
Edge Function. Supabase's shared domain refuses to serve `text/html` on an
ordinary page load, so a widget hosted there renders as raw source in a real
browser rather than a page — no amount of function configuration fixes that,
since it's a property of the domain, not the response. The Edge Function's job
is reduced to verifying Telegram's signed callback, which is unaffected.

The practical consequence: **Telegram's widget flatly refuses `localhost`** in
BotFather's `/setdomain`, so it cannot be tested against `npm run web` without
either deploying once or running a quick HTTPS tunnel
(`cloudflared tunnel --url http://localhost:8081`). The README covers both.

If you would rather launch without it, delete the Telegram button from
`src/app/(auth)/sign-in.tsx`. Nothing else depends on it.

---

## Troubleshooting

**`404 (Not Found)` on a REST call** — PostgREST cannot see the table. Almost
always the migrations did not apply; run the verification query in step 2. If
the tables *are* there, its schema cache is stale:

```sql
notify pgrst, 'reload schema';
```

**"Backend not set up" screen** — the app detected missing tables. Same fix.

**`Missing Supabase configuration` on startup** — `.env` is absent or the dev
server was not restarted after you edited it.

**Sign-in succeeds but the app stays logged out** — the redirect URL is not in
the allow-list in step 5. The URL must match including the `/**`.

**Everything loads but discovery is empty** — expected until someone lists a
book. List one from your own library and it appears.

**Project paused** — free projects pause after 7 days with no requests. Restore
from the dashboard; nothing is lost.

---

## Before launch

- Turn **Confirm email** back on, and configure real SMTP.
- In **Authentication → Providers → Email**, turn **Secure email change**
  off, or leave it on only if you are certain no one needs it — a Telegram
  sign-in's address is a synthetic `tg_<id>@telegram.local` that cannot
  receive mail, so if this stays on, a Telegram user adding a real email
  from Settings → Email & password sign-in (src/app/settings/security.tsx)
  gets asked to confirm from an inbox that does not exist, and the change
  can never complete.
- Set up a weekly `pg_dump` — the free tier has no automatic backups:
  ```bash
  pg_dump "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres" > backup.sql
  ```
- Re-run `./supabase/tests/run.sh` after any schema change. It asserts the
  privacy rules the app depends on — that a stranger cannot read your reviews,
  and that contact details require a session.
