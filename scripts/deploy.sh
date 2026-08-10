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

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# EDIT THIS — the domain's actual document root. Find it in Plesk under the
# domain's "Hosting Settings", or via File Manager's path breadcrumb. It is
# almost always /var/www/vhosts/<domain>/httpdocs, but confirm rather than
# assume: syncing to the wrong path silently serves nothing.
WEBROOT="/var/www/vhosts/kitobjavonim.uz/httpdocs"

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
