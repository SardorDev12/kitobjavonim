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

# Node.js is installed for this domain (confirmed via Plesk's own Node.js
# panel: version 26, prefix /opt/plesk/node/26), just not on this shell's
# PATH by default. Tried in order: the confirmed path first, then whatever's
# already on PATH in case a future Plesk update fixes this shell, then a
# couple of other layouts as a last resort for if the version number changes.
NPM_BIN=""
for candidate in \
  /opt/plesk/node/26/bin/npm \
  "$(command -v npm 2>/dev/null || true)" \
  "$HOME"/nodevenv/*/*/bin/npm \
  /opt/plesk/node/*/bin/npm
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NPM_BIN="$candidate"
    break
  fi
done

if [ -z "$NPM_BIN" ]; then
  echo "Could not find npm anywhere expected." >&2
  echo "Check Plesk's Node.js panel for this domain for the exact path, then" >&2
  echo "either add it to the search list above or hardcode it directly." >&2
  exit 1
fi

# Puts npm AND npx on PATH — they live side by side in every Node.js install,
# so finding one locates the other for free. Built-in suffix-stripping again,
# same reason as above.
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
