#!/usr/bin/env bash
#
# Plesk deploy-actions script. Runs after every `git pull` Plesk performs on
# this repository — set it as the "Additional deploy actions" command in
# Plesk's Git extension. See docs/plesk-deploy.md for the one-time setup.
#
# What it does: installs dependencies, builds the static web export, and
# syncs the result into the public webroot — the same three steps the
# previous manual workflow was zip/upload/extract for, now automatic on push.
set -euo pipefail

# Plesk's deploy-actions shell turned out to be more restricted than a merely
# short PATH: `dirname` — a basic coreutils binary — was not found even after
# adding /usr/bin and /bin to PATH by hand, which points at a genuinely bare
# jailed environment rather than a lookup problem. Worse, that failure did not
# stop the script under `set -e` the way it looks like it should: bash does
# not treat a failing command *inside* a `$(...)` substitution as fatal, only
# the exit status of the substitution's own assignment — so `cd
# "$(dirname ...)/.."` silently became `cd "/.."` and the script kept going
# from the wrong directory instead of stopping. Fixed by never shelling out
# for this at all: `${VAR%/*}` is bash's own built-in suffix-stripping, doing
# what `dirname` does without depending on any external binary existing.
here="${BASH_SOURCE[0]%/*}"
cd "$here/.."

# The dirname jail turned out to be one symptom of a documented Plesk
# behavior, not a one-off quirk: per Plesk's own docs (Website Management >
# Git Support > remote hosting > "Enable Additional Deployment Actions") —
# "On Linux, if SSH access is forbidden for the domain's system user, all
# specified commands will run in a chrooted environment. The home directory
# of the subscription's system user is treated as the file system root for
# that subscription, and no executable files outside the chroot jail can be
# run." That matches everything found troubleshooting this by hand:
# /opt/plesk/node (real, confirmed via Plesk's own Node.js panel),
# /usr/bin/env, and /usr/libexec/nodenv/nodenv (nodenv's real dispatcher,
# found by reading — never executing — a shim script's own source) were all
# unreachable from here, while everything under the vhost's own home
# directory (repo/, httpdocs/) was visible. No path-hunting inside this
# script can fix that; /opt existing at all is a direct, cheap test of
# whether the chroot is still in effect.
if [ ! -d /opt ]; then
  echo "This shell is chrooted (no /opt visible) — by Plesk's own design," >&2
  echo "when SSH access is forbidden for the domain's system user, deploy" >&2
  echo "actions run rooted at the subscription's home directory and simply" >&2
  echo "cannot reach a real Node.js install. This isn't a wrong-path" >&2
  echo "problem; no candidate list in this script can fix it." >&2
  echo >&2
  echo "Fix: Plesk > Websites & Domains > kitobjavonim.uz > Hosting" >&2
  echo "Settings (or Subscriptions > this subscription) > \"SSH access to" >&2
  echo "the server shell\" > set it to a real shell (e.g. /bin/bash)" >&2
  echo "instead of forbidden. That lifts the chroot for this script too." >&2
  echo >&2
  echo "If enabling SSH access isn't an option, build manually instead via" >&2
  echo "Plesk's Node.js panel > \"Выполнить команды Node.js\" (that shell" >&2
  echo "is not chrooted) — see the troubleshooting section of" >&2
  echo "docs/plesk-deploy.md for the exact command." >&2
  exit 1
fi

# Confirmed via Plesk's Node.js panel (npm config get prefix). Tried in
# order: the confirmed path first, a version-glob in case it changes, then
# whatever's already on PATH as a last resort.
NPM_BIN=""
for candidate in \
  /opt/plesk/node/26/bin/npm \
  /opt/plesk/node/*/bin/npm \
  "$(command -v npm 2>/dev/null || true)"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NPM_BIN="$candidate"
    break
  fi
done

if [ -z "$NPM_BIN" ]; then
  echo "Could not find npm under /opt/plesk/node even though /opt is" >&2
  echo "visible (so this isn't the chroot). Check Plesk's Node.js panel" >&2
  echo "for this domain for the exact version/path and add it to the" >&2
  echo "candidate list above." >&2
  exit 1
fi

# Puts npm AND npx on PATH — they live side by side in every Node.js
# install, so finding one locates the other for free.
export PATH="${NPM_BIN%/*}:$PATH"
echo "==> Using npm at $NPM_BIN"

# The repository checkout ("repo") and the public webroot ("httpdocs") are
# sibling folders under the same home directory in Plesk's setup for this
# domain, so httpdocs is reachable as ../httpdocs relative to here — no need
# to hardcode the absolute /var/www/vhosts/... path, which was the harder,
# account-specific thing to pin down. Resolving it with cd+pwd rather than
# using the relative path directly means a wrong assumption fails loudly here
# (set -e) instead of rsync silently writing nowhere useful.
WEBROOT="$(cd "$(pwd)/../httpdocs" && pwd)"

echo "==> Installing dependencies"
npm ci

# --clear bypasses Metro's transform cache. Without it, a build in a checkout
# directory that persists between deploys can serve values baked in by an
# earlier build even after .env.production changes — confirmed while setting
# this up: a stale cache reproduced the previous Supabase URL after the env
# file had already been edited to something else.
echo "==> Building the static web export"
npx expo export --platform web --clear

echo "==> Syncing dist/ into $WEBROOT"
rsync -a --delete dist/ "$WEBROOT/"

echo "==> Deploy complete"
