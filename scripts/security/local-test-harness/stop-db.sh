#!/bin/bash
# Companion to ensure-db.sh: stops the harness started via that script.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f .pgpid ]; then
  PID="$(cat .pgpid)"
  if kill -0 "$PID" 2>/dev/null; then
    kill -TERM "$PID"
    for _ in $(seq 1 20); do
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.5
    done
  fi
  rm -f .pgpid
fi

echo "[stop-db] stopped"
