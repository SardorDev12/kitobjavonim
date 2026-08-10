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

# Plesk's deploy-actions shell runs with a near-empty PATH — even `dirname`,
# about as basic as coreutils gets, was missing without this on first run.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Same story for Plesk-managed Node.js: not on this shell's PATH by default,
# and its install location is version- and account-specific, so it is found
# rather than assumed. Checked in order: whatever's already on PATH (in case
# a future Plesk update fixes this shell), then the layout Plesk's own Node.js
# extension uses for a per-domain interpreter, then a couple of common
# manual-install locations, roughly most- to least-likely for this host.
NPM_BIN="$(command -v npm || true)"
if [ -z "$NPM_BIN" ]; then
  for candidate in \
    "$HOME"/nodevenv/*/*/bin/npm \
    /opt/plesk/node/*/bin/npm \
    /usr/local/opt/node*/bin/npm \
    /usr/local/node*/bin/npm
  do
    if [ -x "$candidate" ]; then
      NPM_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$NPM_BIN" ]; then
  echo "Could not find npm anywhere expected." >&2
  echo "Check Plesk's Node.js panel for this domain for the exact path, then" >&2
  echo "either add it to the search list above or hardcode it directly." >&2
  exit 1
fi

# Puts npm AND npx on PATH — they live side by side in every Node.js install,
# so finding one locates the other for free.
export PATH="$(dirname "$NPM_BIN"):$PATH"
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
