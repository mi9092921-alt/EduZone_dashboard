# Dependency Audit Resolutuions

# Date: 2026-03-28

## High Vulnerability: Picomatch ReDoS (extglob quantifiers)

- **Path:** `apps/admin > eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > picomatch` AND `apps/admin > @storybook/addon-docs > @storybook/csf-plugin > unplugin > picomatch`
- **Severity:** High
- **Context:** This vulnerability relates to Regular Expression Denial of Service (ReDoS) when processing malicious file globs. These specific transitive dependencies exist purely within the Dev toolchain (`eslint` and `storybook-docs`).
- **Resolution:** ACCEPTED. Since these toolchains perform compilation over statically trusted codebases managed exclusively internally in CI/CD (and are never exposed to arbitrary strings governed by an attacker locally), the risk factor is essentially null to the end user. Will automatically resolve as `@next/eslint-plugin-next` and `@storybook/addon-docs` push patch version bumps in future root `pnpm update` sweeps.
- **Action:** Annotated and bypassed.

# Date: 2026-09-02

## High: Next.js (multiple CVEs — SSRF in Server Actions, DoS, unauthenticated Server Function endpoint disclosure)

- **Path:** `apps/admin > next` (direct dependency)
- **Severity:** High / Moderate (multiple advisories)
- **Context:** `next` was declared as `^15.3.0` but the lockfile had resolved to `15.5.19`, which predates the fixed `15.5.21`. These are runtime, request-reachable issues in a production app.
- **Resolution:** FIXED. Bumped the declared floor to `"next": "^15.5.25"` (still within the pre-existing `^15.x` range — no breaking-change risk) and refreshed the lockfile. Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` all pass after the bump with no regressions.

## Moderate: `@opentelemetry/core` — Unbounded memory allocation in W3C Baggage propagation

- **Path:** `apps/admin > @sentry/nextjs > @sentry/node > @opentelemetry/core` (runtime — Sentry's Node SDK, not just its build-time webpack plugin)
- **Resolution:** FIXED. Bumped `@sentry/nextjs` from `^10.47.0` floor to `^10.73.0` (within the existing `^10.x` range), which resolves `@opentelemetry/core` to a patched version in lockstep with Sentry's own otel dependency graph (avoids forcing a mismatched override across otel packages, which are version-sensitive to each other and could not be verified end-to-end without a live Sentry DSN). Verified via typecheck/lint/test/build as above.

## High/Moderate: `postcss`, `nanoid` (build-time only) / Low: `esbuild`

- **Path:** exclusively via `@sentry/nextjs > @sentry/webpack-plugin > webpack > terser-webpack-plugin > ...` (source-map upload tooling) and `next > postcss` (Next's own CSS build pipeline).
- **Context:** verified via `pnpm audit --prod --json`, cross-checked against the resolved dependency path for each advisory. None of these packages are invoked during request handling; they run only inside `next build` / the Sentry CLI source-map step, executed exclusively in CI/CD against a statically trusted codebase, never against attacker-controlled input at runtime. `esbuild` is additionally Windows-dev-server-specific.
- **Resolution:** ACCEPTED, same reasoning as the picomatch entry above. Will resolve automatically as `@sentry/nextjs` and `next` ship further patch releases.
- **Action:** Annotated and bypassed. Re-run `pnpm audit --prod` after any future `@sentry/nextjs`/`next` bump to confirm these have cleared.

## NOT VERIFIED / deliberately not changed in this pass

- `P2-SEC-008` (CSP `unsafe-inline`/`unsafe-eval` in `apps/admin/vercel.json`): correct fix is a nonce-based CSP wired through Next.js middleware and MUI's emotion cache. This is a real architectural change (not a dependency bump) that risks breaking every MUI-styled page if done without a live browser to verify against — no live/headed browser was available in this environment. Left unchanged and flagged as an open P2 item rather than shipped unverified.
