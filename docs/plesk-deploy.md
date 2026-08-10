# Deploying to Plesk (Billur) via Git

Replaces the manual zip → File Manager → extract cycle. Once this is set up,
updating the live site is `git push` — Plesk pulls, builds, and syncs the
result into the webroot on its own.

One-time setup, in order:

## 1. Confirm the webroot path

In Plesk, open the `kitobjavonim.uz` domain → **Hosting Settings**, or check
File Manager's path breadcrumb. It's almost always:

```
/var/www/vhosts/kitobjavonim.uz/httpdocs
```

Open `scripts/deploy.sh` and set `WEBROOT` to whatever you actually see —
don't assume the value above is right for your account.

## 2. Connect the repository

In Plesk, open the domain → **Git** (or find it under the relevant
subscription). **Add Repository**, then:

- **Source**: "Remote Git repository"
- **URL**: `git@github.com:SardorDev12/kitobjavonim.git` (SSH, not HTTPS —
  the repo is private, and SSH is what lets Plesk authenticate without a
  password or token)
- **Repository path**: something *other* than `httpdocs` — e.g. `repo`. The
  checkout needs source files (`src/`, `package.json`, ...) that have no
  business being publicly served; the deploy script builds from here and
  copies only the finished output into `httpdocs` separately.

Plesk will generate its own SSH keypair for this repository and show you the
**public key**. Copy it.

## 3. Authorize that key on GitHub

On [github.com/SardorDev12/kitobjavonim](https://github.com/SardorDev12/kitobjavonim) →
**Settings → Deploy keys → Add deploy key**. Paste the public key Plesk
showed you. Leave **"Allow write access" unchecked** — Plesk only needs to
pull, and a read-only key limits what a compromised server could do to this
one repo, nothing else on the account.

## 4. Set the deploy action

Back in Plesk's Git panel for this repository, find **"Additional deploy
actions"** (a shell script field, runs after every pull) and set it to:

```bash
bash scripts/deploy.sh
```

## 5. Check the Node.js version

Plesk's Node.js panel for this domain — pick a recent LTS (20 or later; this
project was built and tested against Node 26). An old default version is a
plausible source of a build failure that has nothing to do with anything
above, so it's worth checking before troubleshooting further.

## 6. First deploy

Trigger a manual pull in Plesk's Git panel (usually a "Pull updates" or
"Deploy" button). Watch the log it shows — `npm ci`, then the Expo export
output, then the `rsync` line. If it succeeds, `https://www.kitobjavonim.uz`
should be updated within a minute or two.

From here on, `git push` to `main` is the entire deploy process, unless
you've set Plesk to require a manual trigger per push instead of pulling
automatically — that's a toggle in the same panel, your call.

## If something goes wrong

**Build fails on `npm ci`** — the Node version is probably too old, or
`package-lock.json` didn't make it into the repo (it should have; check
`git ls-files package-lock.json`).

**Build succeeds but the site doesn't change** — check the `WEBROOT` path in
`scripts/deploy.sh` actually matches what Plesk showed you in step 1. A wrong
path means `rsync` silently writes to a directory nothing serves.

**Site works but shows a stale Supabase URL or similar** — `.env.production`
in the repo is what the build reads; confirm it has the values you expect.
