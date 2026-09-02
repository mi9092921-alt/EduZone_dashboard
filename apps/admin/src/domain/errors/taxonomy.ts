import { AppError } from './AppError';
import type { RpcErrorCode } from './codes';

/**
 * Error taxonomy (M10 — Error Architecture, Execution Plan §14).
 *
 * Every domain/infrastructure failure is expressed as one of these classes.
 * The taxonomy extends — never replaces — the existing `AppError`:
 * every taxonomy error IS an `AppError`, so existing `parseRpcError`,
 * `instanceof AppError` and `RpcErrorCode` consumers keep working.
 *
 * External-safe policy: `message` is always safe to show to a client.
 * Internal context (SQL details, function names, stack, internal ids)
 * must never be placed in `message` — pass it to `internalDetail`, which
 * is reserved for server-side logs only (see `toClientMessage`).
 */
export class ValidationError extends AppError {
  public readonly name = 'ValidationError' as const;
  /** 400 — invalid/missing input. Message must be user-facing. */
  constructor(message: string, internalDetail?: string, requestId?: string) {
    super('INVALID_TYPE', message, undefined, requestId);
    if (internalDetail) console.error('[ValidationError]', internalDetail);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  public readonly name = 'UnauthorizedError' as const;
  /** 401 — not authenticated / session invalid. */
  constructor(message = 'Authentication required', internalDetail?: string) {
    super('AUTH_REQUIRED', message, undefined);
    if (internalDetail) console.error('[UnauthorizedError]', internalDetail);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  public readonly name = 'ForbiddenError' as const;
  /** 403 — authenticated but not allowed (role/permission/tenant). */
  constructor(message = 'Permission denied', internalDetail?: string) {
    super('PERMISSION_DENIED', message, undefined);
    if (internalDetail) console.error('[ForbiddenError]', internalDetail);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class NotFoundError extends AppError {
  public readonly name = 'NotFoundError' as const;
  /** 404 — resource does not exist (or is hidden from the caller). */
  constructor(resource: string, internalDetail?: string) {
    super('NOT_FOUND', `${resource} not found`, undefined);
    if (internalDetail) console.error('[NotFoundError]', internalDetail);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  public readonly name = 'ConflictError' as const;
  /** 409 — uniqueness/duplicate/state conflict. Message must be user-facing. */
  constructor(message: string, internalDetail?: string) {
    super('DUPLICATE', message, undefined);
    if (internalDetail) console.error('[ConflictError]', internalDetail);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class InfrastructureError extends AppError {
  public readonly name = 'InfrastructureError' as const;
  /**
   * 500 — database/RPC/network/external-service failure.
   * NEVER pass raw DB error text as `message`; callers receive the generic
   * message while the raw cause goes to server logs via `internalDetail`.
   */
  constructor(message = 'An unexpected error occurred. Please try again.', internalDetail?: string) {
    super('INTERNAL_ERROR', message, undefined);
    if (internalDetail) console.error('[InfrastructureError]', internalDetail);
    Object.setPrototypeOf(this, InfrastructureError.prototype);
  }
}

/** HTTP status per taxonomy class (the "تأكد" matrix of §14). */
export function errorStatus(error: unknown): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof UnauthorizedError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ConflictError) return 409;
  if (error instanceof AppError) return 500;
  return 500;
}

/**
 * External-safe message extraction for client-facing boundaries
 * (server actions returning `{ error }`, route handlers, mutations).
 *
 * - AppError (incl. the whole taxonomy) → its own message (already safe).
 * - ZodError → first issue message (validation messages are user-facing).
 * - Anything else (raw DB errors, unknown shapes) → generic text; the raw
 *   error must have been logged by the throw site or the catch site.
 */
export function toClientMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'ZodError' &&
    'issues' in error &&
    Array.isArray((error as { issues?: unknown }).issues)
  ) {
    const first = (error as { issues: { message?: unknown }[] }).issues[0];
    if (first && typeof first.message === 'string') return first.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Maps a raw Supabase/PostgREST error object (already logged server-side by
 * the caller) into the taxonomy. This is the ONE approved replacement for
 * `if (error) throw error;` at the infrastructure boundary:
 *
 *   if (error) throw mapDbError(error, 'contextlabel');
 *
 * - PG/PostgREST infrastructure shapes (SQLSTATE 23505/42P01..., PGRSTnnn)
 *   → generic InfrastructureError (details stay in server logs).
 * - Authored UPPER_SNAKE application codes → AppError keeping the code and
 *   authored message (these are designed to be user-facing).
 */
export function mapDbError(raw: unknown, context: string): AppError {
  if (raw instanceof AppError) return raw;

  const code =
    typeof raw === 'object' && raw !== null && 'code' in raw
      ? String((raw as { code?: unknown }).code ?? '')
      : '';
  const message =
    typeof raw === 'object' && raw !== null && 'message' in raw
      ? String((raw as { message?: unknown }).message ?? '')
      : typeof raw === 'string'
        ? raw
        : '';

  console.error(`[mapDbError] ${context} (${code || 'no-code'}):`, message || raw);

  if (/^[0-9][0-9A-Z]{4}$/.test(code) || /^PGRST/i.test(code) || !code) {
    return new InfrastructureError(undefined, `${context}: ${message}`);
  }
  return new AppError(code as RpcErrorCode, message || 'An unexpected error occurred');
}
