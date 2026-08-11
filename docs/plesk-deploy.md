# Deploying to Plesk (Billur) via Git

Replaces the manual zip → File Manager → extract cycle. Once this is set up,
updating the live site is `git push` — Plesk pulls, builds, and syncs the
result into the webroot on its own.

One-time setup, in order. This reflects what actually worked on this
account's Plesk instance, including two things that were not the first thing
tried — noted below so the same detours don't have to happen twice.

## 1. Create a GitHub access token

The repository is private, so Plesk needs a way to authenticate to it.
**SSH did not work on this host** — the connection failed with `Failed to
gather public SSH host key for the 'github.com'`, consistent with the
account's outbound SSH (port 22) being blocked, which some shared hosting
plans do. HTTPS with a token is the fallback, and is itself a normal,
GitHub-supported way to do this — not a workaround.

GitHub → your profile → **Settings → Developer settings → Personal access
tokens → Fine-grained tokens → Generate new token**:

- **Repository access**: "Only select repositories" → `kitobjavonim`
- **Permissions → Repository permissions → Contents**: Read-only
- Generate, and copy the token (`github_pat_...`) immediately — GitHub only
  shows it once.

## 2. Connect the repository

In Plesk, open the domain → **Git**. **Add Repository**, filling in
everything together before saving (editing fields one at a time after saving
led to Plesk's internal state getting inconsistent — deleting and starting
over with everything filled in at once is what actually worked):

- **Source**: "Remote Git repository"
- **URL-адрес репозитория**: `https://SardorDev12:YOUR_TOKEN@github.com/SardorDev12/kitobjavonim.git`
  — with the real token in place of `YOUR_TOKEN`. Embedding it in the URL
  avoids depending on whether separate username/password fields appear.
- **Путь сервера** (Repository / server path): `repo` — not `httpdocs`. The
  checkout needs source files (`src/`, `package.json`, `.claude/`, ...) that
  have no business being publicly served; the deploy script builds from here
  and syncs only the finished output into `httpdocs` separately. (The first
  attempt left this blank, which checked the raw source out directly into
  `httpdocs` — if that happens, the fix is the same: set this field to `repo`
  and let the next deploy overwrite `httpdocs` with the real build.)

## 3. Set the deploy action

Same screen, **"Включить дополнительные действия развертывания"** (Enable
additional deploy actions) — turn it on. In the shell command box:

```bash
bash scripts/deploy.sh
```

The script installs dependencies, builds the static export, and rsyncs the
result into `../httpdocs` — resolved relative to wherever the checkout
lands, since `repo` and `httpdocs` are sibling folders under the same home
directory on this account. No absolute path needs to be found or hardcoded.

## 4. Check the Node.js version

Plesk's Node.js panel for this domain — pick a recent LTS (20 or later; this
project was built and tested against Node 26). An old default version is a
plausible source of a build failure that has nothing to do with anything
above, so it's worth checking before troubleshooting further.

## 5. First deploy

Trigger a manual pull in Plesk's Git panel (usually a "Pull updates" or
"Deploy" button). Watch the log it shows — `npm ci`, then the Expo export
output, then the `rsync` line. If it succeeds, `https://www.kitobjavonim.uz`
should be updated within a minute or two.

From here on, `git push` to `main` is the entire deploy process, unless
you've set Plesk to require a manual trigger per push instead of pulling
automatically — that's a toggle in the same panel, your call.

## If something goes wrong

**`fatal: this operation must be run in a work tree`** — Plesk's bookkeeping
for the repository connection got inconsistent, generally from editing the
URL and the server path in separate saves. Delete the repository connection
in Plesk and add it again with everything (URL with token, server path
`repo`) filled in on the same form before the first save.

**httpdocs has source files in it** (`.claude`, `(auth)`, `(tabs)`,
`package.json`, ...) — the server path was left as `httpdocs` instead of set
to `repo`. Fix the field per step 2; the next successful deploy will
overwrite it with just the built site.

**Build fails on `npm ci`** — the Node version is probably too old, or
`package-lock.json` didn't make it into the repo (it should have; check
`git ls-files package-lock.json`).

**`Could not find npm anywhere expected`** — the Git deploy-actions shell is
a separate, more restricted jail from whatever environment Plesk's own
Node.js panel runs in; a path confirmed through that panel (e.g.
`npm config get prefix`) can still be completely unreachable from
`scripts/deploy.sh`, not just wrong. If this recurs (a Plesk update, a
different account, a domain rename), the fastest way to find the real path
is **Plesk → domain → Node.js → "Выполнить команды Node.js" (Execute Node.js
commands)** — that panel runs in Plesk's actual managed environment, not the
deploy-actions jail. Two commands to run there (dropdown stays on `npm`):

- `config get prefix` — npm's install root as Plesk sees it.
- `exec -c "which node && which npm"` — the real invocation path; on this
  domain it resolved through nodenv shims at
  `/var/www/vhosts/kitobjavonim.uz/.nodenv/shims/`, not the prefix path
  above. `.nodenv/` sits as a sibling of `repo/` and `httpdocs/` under the
  vhost root, so it's reachable from the deploy script the same relative way
  `WEBROOT` already is — that's the `../.nodenv/shims/npm` candidate at the
  top of the `for candidate in ...` list. If the `exec` output ever points
  somewhere else, add that path to the same list.

If both come up empty, the script also prints a diagnostics block after the
error — `../.nodenv/shims/*`, `/opt/plesk/node/*/`, and
`$HOME/nodevenv/*/*/` — no SSH needed, it's right there in the deploy log.

**Build succeeds but the site doesn't change** — `scripts/deploy.sh` expects
`repo` and `httpdocs` to be sibling folders under the same home directory. If
Plesk's layout for this account differs, `WEBROOT="$(cd "$(pwd)/../httpdocs" && pwd)"`
will fail loudly (the script uses `set -e`) rather than silently syncing to
the wrong place — the error will show which path it tried.

**Site works but shows a stale Supabase URL or similar** — `.env.production`
in the repo is what the build reads; confirm it has the values you expect.
Also worth knowing: a persistent checkout directory can serve a value baked
in by an *earlier* build even after `.env.production` changes, because of
Metro's transform cache — this is why the script always runs
`expo export --clear`, and it's worth checking that flag is still there if
this ever recurs.
