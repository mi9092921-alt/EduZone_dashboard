#!/bin/bash
# "Fast" Security / RLS CI gate — always-on, Docker-free, blocking.
#
# This is deliberately separate from scripts/security/rls-smoke-test.ts
# and permission-exhaustive-test.ts, which stay exactly as they are: a
# deeper SEC-1 cross-tenant + extend_enrollment privileged-RPC matrix
# that runs against a real, Docker-based local Supabase stack
# (PostgREST + GoTrue) as the "Security gate" step of .github/workflows/
# e2e.yml. That gate is thorough but currently DORMANT (gated behind the
# E2E_ENABLED repository variable per that workflow's activation
# checklist) and, by nature of needing `supabase start`, too slow to
# place directly after Unit tests on every single PR.
#
# fast-gate-rls.ts / fast-gate-permissions.ts cover the same class of
# regression (RLS bypass, permission-check bypass, privilege escalation)
# against the REAL canonical supabase/schema/*.sql applied to a
# disposable embedded Postgres 17 (local-test-harness/, no Docker, no
# live Supabase project) — light enough to run unconditionally on every
# PR, immediately after Unit tests and before the production build, so a
# regression is caught before spending time on a build. See
# local-test-harness/01_test_session_helpers.sql for how session/RLS
# impersonation is emulated without a real PostgREST/GoTrue stack.
#
# This script:
#   1. Boots the disposable local Postgres 17 harness.
#   2. Applies the REAL, canonical supabase/schema/*.sql files against
#      it, in the exact order declared by supabase/config.toml's
#      schema_paths (see local-test-harness/apply-schema.mjs) — the same
#      RLS policies and permission functions that ship to production.
#   3. Runs fast-gate-rls.ts and fast-gate-permissions.ts against it.
#   4. Exits non-zero if EITHER test script reports a failure, a crash,
#      or was skipped — this script's own exit code is what CI gates on.
#   5. Always tears the harness down, whether the tests passed or not.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$SCRIPT_DIR/local-test-harness"

cleanup() {
  echo "[run-security-gate] tearing down harness..."
  bash "$HARNESS_DIR/stop-db.sh" || true
}
trap cleanup EXIT

echo "[run-security-gate] installing local-test-harness dependencies..."
(cd "$HARNESS_DIR" && npm install) || { echo "[run-security-gate] harness npm install FAILED"; exit 1; }

echo "[run-security-gate] installing security test script dependencies..."
(cd "$SCRIPT_DIR" && npm install) || { echo "[run-security-gate] scripts npm install FAILED"; exit 1; }

echo "[run-security-gate] starting harness..."
bash "$HARNESS_DIR/ensure-db.sh" || { echo "[run-security-gate] harness failed to start"; exit 1; }

echo "[run-security-gate] applying canonical supabase/schema/*.sql..."
node "$HARNESS_DIR/apply-schema.mjs" || { echo "[run-security-gate] schema apply FAILED"; exit 1; }

STATUS=0

echo ""
echo "[run-security-gate] === Fast RLS gate ==="
(cd "$SCRIPT_DIR" && npx tsx fast-gate-rls.ts)
RLS_STATUS=$?
if [ $RLS_STATUS -ne 0 ]; then
  echo "[run-security-gate] Fast RLS gate FAILED (exit $RLS_STATUS)"
  STATUS=1
fi

echo ""
echo "[run-security-gate] === Fast exhaustive permission gate ==="
(cd "$SCRIPT_DIR" && npx tsx fast-gate-permissions.ts)
PERM_STATUS=$?
if [ $PERM_STATUS -ne 0 ]; then
  echo "[run-security-gate] Fast permission gate FAILED (exit $PERM_STATUS)"
  STATUS=1
fi

echo ""
if [ $STATUS -ne 0 ]; then
  echo "[run-security-gate] ❌ Security/RLS gate FAILED — blocking."
else
  echo "[run-security-gate] 🔒 Security/RLS gate passed."
fi

exit $STATUS
