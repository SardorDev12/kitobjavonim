# Admin user management

Backs three actions in the admin panel's Users section that can't be done
with a plain SQL function (see `supabase/migrations/0013_admin_panel.sql`
for the ones that can): creating a new admin account with a password,
banning a login outright, and deleting an account. All three need
Supabase's Auth Admin API, which only works with the `service_role` key —
so, same shape as `scan-cover` and `telegram-auth`, that key lives only in
this function and is never sent to any client.

Called from the admin panel via
`supabase.functions.invoke('admin-users', { body: { action, ... } })`.

## Security model

Every request goes through the same two checks before anything privileged
happens:

1. **The caller must be signed in.** The `Authorization` header's token is
   verified with `auth.getUser()` — not decoded and trusted blindly.
2. **The caller's own `profiles.is_admin` must be true**, checked fresh
   against the database on every call (not cached, not taken from a claim
   in the token).

On top of that, `set_ban` and `delete_user` both refuse to act on another
admin account — that account has to be demoted first, as a separate step.
This is what stops one click from locking out or deleting a co-admin, by
accident or via a compromised admin session.

CORS is locked to `ADMIN_ALLOWED_ORIGINS` rather than `*`: unlike
`scan-cover` (which only reads a book cover), a leaked response here could
mean a created account, a ban, or a deletion, so the response is only ever
handed back to the admin panel's own origin.

## Setup

```bash
supabase secrets set ADMIN_ALLOWED_ORIGINS=https://admin.kitobjavonim.uz
supabase functions deploy admin-users
```

No `--no-verify-jwt` here (unlike `telegram-auth`) — the caller is always a
signed-in admin, so Supabase's own gateway checking the JWT first is an
extra layer, not an obstacle.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically — do not set them yourself.

For local testing against more than one origin (e.g. `localhost:5173` while
developing the admin panel), pass a comma-separated list:

```bash
supabase secrets set ADMIN_ALLOWED_ORIGINS=http://localhost:5173,https://admin.kitobjavonim.uz
```

## The very first admin account

There is no sign-up screen in the admin panel by design, so `create_admin`
(which needs an already-signed-in admin to call it) can't bootstrap the
first one. Create it directly:

1. Supabase Dashboard → **Authentication → Users → Add user** — set an
   email and password, and tick **Auto Confirm User**.
2. Supabase Dashboard → **SQL Editor**, run:
   ```sql
   update profiles set is_admin = true where id = '<the user's UUID from step 1>';
   ```

From then on, that account can create every other admin from inside the
panel itself.

## Actions

All three take `{ action: '...', ... }` as the request body.

- **`create_admin`** — `{ email, password, display_name? }`. Password must
  be at least 12 characters (the panel's own form also enforces this, but
  the function does too, since the form isn't the trust boundary). Returns
  `{ id, email }`.
- **`set_ban`** — `{ user_id, banned: boolean }`. Uses Auth's own
  `ban_duration` so a banned account is refused at sign-in itself, not by
  an app-level flag every query would have to remember to check. Returns
  `{ ok: true }`.
- **`delete_user`** — `{ user_id }`. Deletes the `auth.users` row, which
  cascades through every table that references it (`profiles`,
  `user_books`, `bookshelves`, and so on all use
  `on delete cascade`). This is the real mechanism behind the app's
  "contact us to delete your account" path — there is still no
  self-service delete button in the consumer app, but an admin can now act
  on that request directly instead of it being a dead end. Returns
  `{ ok: true }`.
