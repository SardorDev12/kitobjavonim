# Deploying kitobjavonim.uz (Billur/Plesk)

## How it works

The static web build happens in **GitHub Actions**, not on Plesk. On every
push to `main`, `.github/workflows/deploy-web.yml` runs `npm ci` and
`expo export --platform web --clear`, then force-pushes just the built
`dist/` output to a `deploy` branch (one commit each time, no accumulating
history). Plesk's Git integration is pointed at that `deploy` branch, with
its target directory set straight to `httpdocs` — Plesk only ever has to
sync already-built files, never run a build itself.

This exists because Plesk's own build environment turned out to be a dead
end for this account: SSH access to the server shell is forbidden for this
domain's system user, and Plesk chroots its Git "additional deploy actions"
to the subscription's home directory whenever that's the case (documented
Plesk behavior, not a bug) — no Node.js install anywhere outside that
directory is reachable from there, full stop. See "History" below if you
want the full trail. If SSH access is ever enabled for this domain, that
constraint goes away and building directly on Plesk becomes an option again
via `scripts/deploy.sh` — kept in the repo for exactly that case, though it
currently isn't wired into anything.

## One-time setup

1. **GitHub Actions needs no extra secrets.** It pushes to the `deploy`
   branch using the automatic `GITHUB_TOKEN` — the workflow already
   declares `permissions: contents: write`.

2. **Create the `deploy` branch once** by running the workflow: GitHub →
   Actions tab → "Build and publish web export" → **Run workflow** (or just
   push any commit to `main`).

3. **Point Plesk at it**: Websites & Domains → kitobjavonim.uz → Git →
   Repository Settings → **Изменить ветку и путь** (Change branch and
   path):
   - **Branch**: `deploy`
   - **Путь сервера** (server path): `httpdocs` — not `repo`. There's no
     source checkout to keep separate from the webroot anymore; the
     `deploy` branch only ever contains the finished, built site.

4. **Turn off "Включить дополнительные действия развертывания"** (Additional
   deploy actions) if it's on — nothing needs to run server-side anymore.

5. Confirm deploy mode is **Automatic** (same Repository Settings screen),
   then do a first manual pull: Git panel → **Получить сейчас**.

## Ongoing use

`git push` to `main` → GitHub Actions builds and updates `deploy` →
Plesk syncs `deploy` into `httpdocs`. Nothing needs to run inside Plesk. If
auto-pull-on-push isn't configured (see the webhook URL in Repository
Settings), pull manually with **Получить сейчас** after a push.

## If something goes wrong

**GitHub Actions build fails** — check the Actions tab in GitHub; same
failure modes a local `npm ci && npx expo export --platform web --clear`
would have (e.g. `package-lock.json` out of sync, a bad `.env.production`
value).

**`deploy` branch doesn't update** — confirm the workflow actually ran
(Actions tab). A branch protection rule on `deploy` could block the
force-push; there shouldn't be one, since nothing else should ever write to
that branch by hand.

**Plesk doesn't pick up new `deploy` commits** — the token Plesk uses only
has `Contents: Read-only` access, which is enough to pull; if auto-pull
isn't wired up, pull manually via **Получить сейчас**, or check the webhook
URL in Repository Settings.

**Site shows a stale Supabase URL or similar** — `.env.production`
(committed on purpose — see the note in that file) is what the GitHub
Actions build reads; check its values there and re-run the workflow
(`workflow_dispatch` is enabled, so it can be triggered manually).

**Favicon (or anything else) looks unchanged after a deploy** — check it's
not just the browser caching the old one before assuming the pipeline is
broken; a hard refresh or a private window rules that out fast.

## History: why the build doesn't happen on Plesk

Kept for context in case SSH access to the server shell is ever enabled for
this domain, which would remove the reason for building off-Plesk entirely.

Git's "additional deploy actions" ran `scripts/deploy.sh`, which chased four
different explanations for `npm`/`node` being unreachable before finding the
real one:

1. First guess was a merely short `PATH` — wrong; even `dirname`, basic
   coreutils, wasn't found.
2. Then nodenv shims at `.nodenv/shims/` (found via Plesk's own Node.js
   panel, which runs in a normal, unrestricted shell) — the shims exist and
   are reachable, but are `#!/usr/bin/env bash` scripts, and `/usr/bin/env`
   itself is missing from this shell too (`bad interpreter: No such file or
   directory`).
3. Reading (never executing) the npm shim's own source showed it delegates
   to `/usr/libexec/nodenv/nodenv` — outside the vhost, so equally
   unreachable.
4. Plesk's own docs settled it (Website Management → Git Support → remote
   hosting → "Enable Additional Deployment Actions"):

   > On Linux, if SSH access is forbidden for the domain's system user, all
   > specified commands will run in a chrooted environment. The home
   > directory of the subscription's system user is treated as the file
   > system root for that subscription, and no executable files outside the
   > chroot jail can be run.

   The subscription's home directory (containing `repo/`, `httpdocs/`) was
   always reachable; everything outside it (`/opt`, `/usr/bin/env`,
   `/usr/libexec`) never was, in any of the four attempts. That's a hard
   boundary, not a path to find — the fix has to happen in Plesk (enabling
   SSH access to the server shell), not in the script.

A manual middle ground also works, if you'd rather not touch the GitHub
Actions setup or enable SSH access: Plesk's separate **Node.js panel →
"Выполнить команды Node.js"** runs in that same normal, unrestricted shell
mentioned in step 2 above. Pull via the Git panel, then run:

```
exec -c "cd ../repo && npm ci && npx expo export --platform web --clear && rsync -a --delete dist/ ../httpdocs/"
```

(This assumes the Git repo's server path is still `repo`, matching the
original one-checkout setup — not the current `deploy`-branch-into-`httpdocs`
arrangement.)
