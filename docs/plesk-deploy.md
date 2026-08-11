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

1. **Pushing to `deploy` needs no extra secrets** — it uses the automatic
   `GITHUB_TOKEN` (workflow already declares `permissions: contents:
   write`). Purging Cloudflare's cache (step 6) does need two repo secrets.

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

6. **Wire up Plesk's webhook, so pushes deploy without a manual click**:
   same Repository Settings screen shows a webhook URL. Copy it, then in
   GitHub: repo → Settings → Webhooks → **Add webhook** → paste it into
   Payload URL, content type `application/json`, trigger on "Just the push
   event" → Add webhook. Every push to `deploy` (i.e. every successful
   Actions run) now makes Plesk pull and sync into `httpdocs` on its own.

7. **Cloudflare cache purge, so a deploy doesn't need a manual cache purge
   too** (this domain sits behind Cloudflare — confirmed the hard way: a
   favicon update was invisible until the Cloudflare cache was purged by
   hand, even though the correct file was already live in `httpdocs`).
   - Cloudflare dashboard → My Profile → API Tokens → **Create Token** →
     Custom token → permission `Zone / Cache Purge / Purge`, scoped to the
     `kitobjavonim.uz` zone only. Copy the token.
   - Cloudflare dashboard → select the `kitobjavonim.uz` zone → the
     **Zone ID** is in the right sidebar. Copy it too.
   - GitHub → repo → Settings → Secrets and variables → Actions → **New
     repository secret** → add both `CLOUDFLARE_API_TOKEN` and
     `CLOUDFLARE_ZONE_ID`.

## Ongoing use

`git push` to `main` → GitHub Actions builds, pushes to `deploy`, waits
(polling `https://kitobjavonim.uz/.build-sha`, a marker file the build
writes) for Plesk's webhook to actually sync it into `httpdocs`, then purges
Cloudflare. Nothing manual, as long as steps 6 and 7 above are done — if
either isn't, see "If something goes wrong" below for what breaks and how
to tell.

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

**Favicon (or anything else) looks unchanged after a deploy** — two caches
sit between a deploy and your browser, check them in order: first, load the
asset's own URL directly in a private window (e.g.
`https://kitobjavonim.uz/favicon.ico`) — if it's already correct there, it
was only ever your browser's favicon cache (notoriously sticky, ignores a
normal hard refresh). If it's still wrong even loaded directly, Cloudflare's
edge cache is serving something stale; the workflow purges it automatically
once step 7 above is set up, or purge by hand meanwhile (Cloudflare
dashboard → Caching → Configuration → Purge Everything).

**Actions log shows `::warning::` about polling timing out** — the build
reached `deploy`, but `https://kitobjavonim.uz/.build-sha` never matched
this build's commit SHA within the polling window, so Cloudflare was
deliberately *not* purged (purging before the real files land would just
re-cache the old ones again). First, check whether it actually landed a
bit later anyway: open `https://kitobjavonim.uz/.build-sha` directly and
compare it to the commit SHA in the Actions log's `Run echo "..."` step.
On this host, Plesk's webhook consistently returns success within seconds
but the real pull+deploy on Plesk's end has been observed taking 10+
minutes regardless (confirmed twice, not a one-off) — the polling window is
25 minutes for exactly this reason, but if it's *still* not landing well
past that, then check Plesk's webhook is actually configured (step 6) —
Plesk's Git panel shows the latest commit it pulled, which should
eventually match the workflow's commit. If the webhook isn't set up at all,
pull and deploy manually in Plesk, then purge Cloudflare by hand for that
one deploy.

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
