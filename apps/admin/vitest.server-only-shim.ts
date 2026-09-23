/**
 * Vitest shim for the `server-only` package.
 *
 * The real package throws when its "default" export condition is resolved
 * (i.e. anywhere outside a react-server/Next.js server bundle). Vitest runs
 * server modules in plain Node, so without this alias every test that
 * transitively imports a `server-only`-guarded module (service-role client,
 * page guard) would fail at import time.
 */
export {};
