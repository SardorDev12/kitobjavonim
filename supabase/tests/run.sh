#!/usr/bin/env bash
#
# Applies every migration to a throwaway Postgres instance and runs the RLS
# tests against it. Nothing here touches your Supabase project.
#
#   brew install postgresql@17
#   ./supabase/tests/run.sh
#
# The expected result of each check is written next to it in rls_test.sql — the
# important ones are that a stranger reads 0 rows from user_books (private
# reviews stay private) and that anonymous visitors can still read `listings`.

set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}"
export PATH="$PGBIN:$PATH"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"
DATADIR="$(mktemp -d)/pgdata"
PORT="${PGPORT:-55432}"
SOCKET="$(mktemp -d)"

cleanup() {
  pg_ctl -D "$DATADIR" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$DATADIR" "$SOCKET"
}
trap cleanup EXIT

initdb -D "$DATADIR" -U postgres --no-sync -A trust --encoding=UTF8 --locale=en_US.UTF-8 >/dev/null
pg_ctl -D "$DATADIR" -o "-p $PORT -k $SOCKET -c listen_addresses=''" -l "$DATADIR/server.log" start >/dev/null
sleep 2

psql -h "$SOCKET" -p "$PORT" -U postgres -q -c "create database hl;"

for f in "$HERE/_supabase_shim.sql" "$MIGRATIONS"/*.sql; do
  echo "applying $(basename "$f")"
  psql -h "$SOCKET" -p "$PORT" -U postgres -d hl -v ON_ERROR_STOP=1 -q -f "$f"
done

echo
psql -h "$SOCKET" -p "$PORT" -U postgres -d hl -f "$HERE/rls_test.sql"

echo
psql -h "$SOCKET" -p "$PORT" -U postgres -d hl -f "$HERE/admin_test.sql"
