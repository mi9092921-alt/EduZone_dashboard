#!/bin/bash
# Idempotent: ensures the local disposable PG17 harness is up on :54329.
export PGBIN="/home/claude/EduZone_dashboard/scripts/security/local-test-harness/node_modules/@embedded-postgres/linux-x64/native/bin"
export PGDATA="/home/claude/EduZone_dashboard/scripts/security/local-test-harness/.pgdata"
export PGPASSWORD=postgres
if ! /usr/bin/pg_isready -h 127.0.0.1 -p 54329 >/dev/null 2>&1; then
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /home/claude/EduZone_dashboard/scripts/security/local-test-harness/pg.log -o '-p 54329' start" >/dev/null 2>&1
  for i in $(seq 1 30); do
    /usr/bin/pg_isready -h 127.0.0.1 -p 54329 >/dev/null 2>&1 && break
    sleep 0.5
  done
fi
/usr/bin/pg_isready -h 127.0.0.1 -p 54329
