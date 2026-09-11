#!/bin/bash
# Idempotent: ensures the local disposable PG17 harness is up on :54329.
# Portable -- no hardcoded absolute paths, no `su` to a system user
# (start-db.mjs uses embedded-postgres's own `createPostgresUser: true`
# instead, which works the same whether this runs as root in a sandboxed
# container or as an unprivileged user on a GitHub Actions runner).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PGBIN="$SCRIPT_DIR/node_modules/@embedded-postgres/linux-x64/native/bin"
if [ ! -x "$PGBIN/pg_isready" ]; then
  # macOS dev machines
  PGBIN="$SCRIPT_DIR/node_modules/@embedded-postgres/darwin-arm64/native/bin"
fi

if [ ! -d node_modules ]; then
  echo "[ensure-db] installing local-test-harness dependencies..."
  npm install
fi

# Extensions referenced by supabase/schema/*.sql that aren't bundled with
# a vanilla Postgres (pg_cron, pg_net, supabase_vault) -- safe to re-run.
node install-stub-extensions.mjs

if "$PGBIN/pg_isready" -h 127.0.0.1 -p 54329 >/dev/null 2>&1; then
  echo "[ensure-db] already up on :54329"
  exit 0
fi

echo "[ensure-db] starting embedded Postgres 17 on :54329..."
nohup node start-db.mjs > pg.log 2>&1 < /dev/null &
echo $! > .pgpid

for _ in $(seq 1 60); do
  if grep -q '^READY' pg.log 2>/dev/null; then
    echo "[ensure-db] ready"
    exit 0
  fi
  if ! kill -0 "$(cat .pgpid)" 2>/dev/null; then
    echo "[ensure-db] start-db.mjs exited early -- see pg.log" >&2
    cat pg.log >&2
    exit 1
  fi
  sleep 1
done

echo "[ensure-db] timed out waiting for READY -- see pg.log" >&2
cat pg.log >&2
exit 1
