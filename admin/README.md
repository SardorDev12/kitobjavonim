# Kitob Javonim — admin panel

A separate, minimal web app for moderation and account management, deployed
to its own Cloudflare subdomain and kept deliberately apart from the
consumer app at every layer:

- **Separate codebase.** Plain Vite + React + TypeScript, not Expo/React
  Native — this is a browser-only internal tool, so it doesn't carry the
  consumer app's native tooling, routing, or ~4.7MB bundle. Its own
  `package.json`, `tsconfig.json`, and build (`admin/dist`); the root
  `tsconfig.json` excludes this folder entirely.
- **Separate deploy.** Its own `wrangler.jsonc` → its own Cloudflare Worker
  (`kitobjavonim-admin`) → its own subdomain. A compromise or outage on one
  side never touches the other.
- **Same branch, separate deploy.** This app lives in `admin/` alongside
  the consumer app on `develop`/`main` — a separate Cloudflare project
  connected via Git tracks the same branch but with its root directory set
  to `admin`, so it only ever builds and deploys this folder, and never
  pulls in the consumer app's own build. (It used to live on its own
  `admin-panel` branch; that turned out to buy no real isolation — a
  Cloudflare project's root directory setting already scopes the build to
  this folder on its own — while costing an extra manual merge step for
  every backend change shared between the two, like the audit log
  migration.) The database side
  (`supabase/migrations/0013_admin_panel.sql` and
  `supabase/functions/admin-users/`) lives right next to this folder,
  since those are real schema history that has to stay in sequence with
  every other migration regardless of which frontend calls them.
- **Separate login.** Email + password only, gated by `profiles.is_admin`.
  No Google/Telegram, no sign-up screen — an admin account is either
  bootstrapped once by hand (below) or created by an existing admin from
  inside the Users tab.
- **Same backend.** Same Supabase project as whichever environment
  (staging or production) this deployment targets, so moderation actions
  take effect on real data through the same RLS-protected database — see
  `supabase/migrations/0013_admin_panel.sql` for the SQL side and
  `supabase/functions/admin-users/` for the three actions that need the
  Auth Admin API instead (creating an account with a password, banning,
  deleting).

**All admin operations live here now** — the consumer app has no admin
surface of its own; there used to be a `/admin/reports` screen gated behind
`is_admin` inside it, and that has been removed in favor of this panel.

## Why this needed to exist

`profiles.is_admin` was already unforgeable from the client (it's simply
absent from the column grant that lets a user update their own profile —
see `0012_report_moderation.sql`), so the actual data was always safe. What
this adds is a real separation of privilege at the *interface* level:
moderation and account-management actions no longer live behind a route
inside the same app every ordinary user has installed, sharing its
dependencies, its bundle, and its attack surface. A vulnerability in the
consumer app's dependency tree — one aimed at ordinary users — has no path
to this panel at all now, because this panel doesn't ship any of that code.

## Local development

```bash
cd admin
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

Use **staging**'s Supabase project values while developing — same reasoning
as the main app's own `.env.staging`: nothing here should touch production
data by accident during development.

## First admin account

There is no sign-up screen, so the very first admin has to be created
directly against Supabase, once:

1. Dashboard → **Authentication → Users → Add user** — set an email and
   password, tick **Auto Confirm User**.
2. Dashboard → **SQL Editor**, run:
   ```sql
   update profiles set is_admin = true where id = '<the user's UUID from step 1>';
   ```

From then on, sign in with that account and use **Users → + New admin** to
create every other admin — that flow is what `supabase/functions/admin-users/`
exists for. Repeat this bootstrap once per Supabase project (staging and
production are separate projects with separate users).

## Deploying

Two ways to get this built and published — pick whichever fits:

**Cloudflare Git integration (no local machine needed).** Workers & Pages →
connect the GitHub repo → track **`main`** (production) or **`develop`**
(staging) → root directory `admin`, build command `npm run build`, output
directory `dist`. Cloudflare builds and deploys on every push to that
branch — the root directory setting is what keeps this build scoped to
`admin/` alone, without needing a dedicated branch for it. Set
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` in that project's own
**Settings → Variables** *before* the first build — Vite inlines `VITE_*`
values into the bundle at build time, so they have to exist when Cloudflare
runs `npm run build`, not after. Adding or correcting a variable later
doesn't retroactively fix an already-built deployment — it only takes
effect on the *next* build, so a variable change needs a fresh push (or a
manual retry that actually re-runs the build step, not just re-serves the
existing one) before it does anything.

The staging project (`kitobjavonim-admin-staging`) is connected this way,
tracking `develop`, with its **Deploy command** and **Non-production
branch deploy command** both overridden to `--name
kitobjavonim-admin-staging` — `admin/wrangler.jsonc`'s own `name` field is
`kitobjavonim-admin`, reserved for the production project, which tracks
`main` instead.

**Local build + wrangler CLI**, if you'd rather:

```bash
cd admin
npm run build
npx wrangler deploy
```

That publishes `admin/dist` as the `kitobjavonim-admin` Worker directly,
reading `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from your local `.env`
at build time instead.

Either way, once the project exists:

1. **Workers & Pages → [project] → Settings → Domains & Routes →
   Add → Custom domain** — point your admin subdomain (e.g.
   `admin.kitobjavonim.uz`) at this Worker.
2. Set `ADMIN_ALLOWED_ORIGINS` on the **Supabase** project (not Cloudflare)
   to that same subdomain — see `supabase/functions/admin-users/README.md`.
   The `admin-users` Edge Function refuses to answer any other origin.

Deploy staging and production as two entirely separate Workers pointed at
two entirely separate subdomains (e.g. `admin.kitobjavonim.uz` and
`admin-staging.kitobjavonim.uz`), each with its own project's
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — same split as the consumer
app's `kitobjavonim` / `kitobjavonim-staging` Workers, and for the same
reason: it should not be possible to fat-finger a staging test into
production by having them share anything.

## Security notes

- **No public sign-up, ever.** The only way in is a password an existing
  admin set directly, or the one-time bootstrap above.
- **`is_admin` is re-checked server-side on every single action** — the
  RPCs in `0013_admin_panel.sql` and the `admin-users` function all check
  the caller's own `profiles.is_admin` fresh, every call. The panel's own
  login gate (`useAdminAuth`) only avoids flashing the UI at a signed-in
  non-admin; it is not the real boundary, and doesn't need to be.
- **Idle sign-out.** A signed-in tab left unattended for 20 minutes signs
  itself out (`useIdleSignOut`) — a stricter default than the consumer app,
  intentionally, since this session can ban or delete accounts.
- **Passwords are held to a higher floor** (12+ characters) when an admin
  creates another admin, enforced both in the form and again inside the
  Edge Function itself.
- **An admin account can't be banned or deleted directly.** Both actions
  refuse to run against another `is_admin` account — it has to be demoted
  first, as its own deliberate step. This is what stops one bad click (or
  one compromised admin session) from taking out a co-admin.
- **The last remaining admin can't demote themselves** — `admin_set_admin`
  refuses it, since there is no sign-up path back in if that ever
  succeeded.
- **CORS on `admin-users` is locked to `ADMIN_ALLOWED_ORIGINS`**, not `*` —
  see that function's own README for why this matters more there than it
  does for `scan-cover`.
- **`SUPABASE_SERVICE_ROLE_KEY` never leaves the Edge Function.** This
  panel's browser bundle only ever holds an anon key and the signed-in
  admin's own session token, exactly like the consumer app.

## What's deliberately not here (yet)

- **No MFA.** A second factor (TOTP) is a natural next hardening step if
  the number of admins or the sensitivity of what they can do grows —
  Supabase Auth supports it natively. Not added now because it wasn't
  asked for, not because it wouldn't help.
- **No router.** One page, tab-switched with local state, since there are
  no deep links or bookmarks worth supporting yet. `wrangler.jsonc` has no
  SPA fallback configured for exactly this reason — if routes get added
  later, that needs revisiting alongside them.
