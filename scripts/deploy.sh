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

# `npm config get prefix` (run through Plesk's Node.js panel, which has its
# own working environment) says /opt/plesk/node/26 — but that path is not
# reachable from *this* shell at all: the deploy-actions shell for Git is a
# separate, more restricted jail that simply doesn't have /opt mounted.
# `npm exec -c "which node && which npm"` (same panel) resolved through
# nodenv shims instead, at
# /var/www/vhosts/kitobjavonim.uz/.nodenv/shims/{node,npm} — reachable from
# here as ../.nodenv/shims, a sibling of repo/ and httpdocs/ under the vhost
# root, the same way WEBROOT below already is. BUT the shims themselves are
# `#!/usr/bin/env bash` scripts, and this jail doesn't have /usr/bin/env
# either — confirmed by trying to run the npm shim directly and getting
# "bad interpreter: No such file or directory". Every Node CLI wrapper has
# the same problem (npm's shim, npx, node_modules/.bin/expo — all shebang
# scripts), so patching just the one call that happened to fail first would
# only move the failure one step deeper.
#
# The fix that survives the whole chain: never let the OS exec a shebang
# script at all. `node` itself is a real compiled binary — no interpreter
# line to resolve — so calling it directly on the actual .js entry files
# (npm's own bin/npm-cli.js, and later Expo's node_modules/expo/bin/cli)
# needs nothing but that one binary, confirmed present via nodenv's
# versions/ directory (a sibling of shims/ under the same .nodenv root).
NODE_BIN=""
NPM_CLI=""
for d in ../.nodenv/versions/26.7.0/ ../.nodenv/versions/*/; do
  if [ -x "${d}bin/node" ] && [ -f "${d}lib/node_modules/npm/bin/npm-cli.js" ]; then
    NODE_BIN="${d}bin/node"
    NPM_CLI="${d}lib/node_modules/npm/bin/npm-cli.js"
    break
  fi
done

if [ -z "$NODE_BIN" ]; then
  echo "Could not find a real node binary under ../.nodenv/versions/*/." >&2
  echo "Check Plesk's Node.js panel (Execute Node.js commands tab, dropdown" >&2
  echo "on npm) for the real layout: run \`config get prefix\` and" >&2
  echo "\`exec -c \"which node\"\`, then update the search above." >&2
  echo >&2
  echo "Diagnostics (uses only bash builtins, no external commands needed):" >&2
  echo "-- ../.nodenv/versions/*/ --" >&2
  for d in ../.nodenv/versions/*/; do [ -d "$d" ] && echo "  $d" >&2; done
  echo "-- ../.nodenv/shims/*/ --" >&2
  for f in ../.nodenv/shims/*; do [ -e "$f" ] && echo "  $f" >&2; done
  exit 1
fi

echo "==> Using node at $NODE_BIN"

# Belt and braces: our own calls below use $NODE_BIN by absolute path (no
# shebang involved), but if npm spawns a shell internally for some
# dependency's lifecycle script that calls bare `node`, that subshell needs
# it resolvable via PATH too — and this is the real compiled binary's
# directory, not a shebang shim, so it's safe to expose.
export PATH="${NODE_BIN%/*}:$PATH"

# The repository checkout ("repo") and the public webroot ("httpdocs") are
# sibling folders under the same home directory in Plesk's setup for this
# domain, so httpdocs is reachable as ../httpdocs relative to here — no need
# to hardcode the absolute /var/www/vhosts/... path, which was the harder,
# account-specific thing to pin down. Resolving it with cd+pwd rather than
# using the relative path directly means a wrong assumption fails loudly here
# (set -e) instead of rsync silently writing nowhere useful.
WEBROOT="$(cd "$(pwd)/../httpdocs" && pwd)"

echo "==> Installing dependencies"
"$NODE_BIN" "$NPM_CLI" ci

# --clear bypasses Metro's transform cache. Without it, a build in a checkout
# directory that persists between deploys can serve values baked in by an
# earlier build even after .env.production changes — confirmed while setting
# this up: a stale cache reproduced the previous Supabase URL after the env
# file had already been edited to something else.
#
# Invoking node_modules/expo/bin/cli directly (rather than `npx expo` or
# node_modules/.bin/expo) for the same reason as npm above: both of those go
# through a `#!/usr/bin/env node` shebang, which this jail can't resolve.
# bin/cli is expo's actual entry file — confirmed via its package.json
# "bin" field — so running it as an argument to node needs no shebang at all.
echo "==> Building the static web export"
"$NODE_BIN" node_modules/expo/bin/cli export --platform web --clear

echo "==> Syncing dist/ into $WEBROOT"
rsync -a --delete dist/ "$WEBROOT/"

echo "==> Deploy complete"
