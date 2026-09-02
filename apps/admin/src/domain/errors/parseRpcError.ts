import { AppError } from './AppError';
import type { RpcErrorCode } from './codes';

/**
 * Parse any raw error (Supabase PostgrestError, generic Error, unknown)
 * into a typed AppError.
 *
 * Never let raw Supabase errors propagate to the UI.
 */
export function parseRpcError(raw: unknown): AppError {
  if (raw instanceof AppError) return raw;

  // Supabase PostgrestError shape: { code, message, details, hint }
  if (isPostgresError(raw)) {
    const code = raw.code || 'UNKNOWN';
    // M10: raw PG/PostgREST codes (e.g. 23505, 42P01, PGRST116) are internal —
    // their messages must never be copied verbatim to a client. Our own RPCs
    // signal logic failures with UPPER_SNAKE codes and authored, user-facing
    // messages; only raw infrastructure shapes get masked (raw text logged
    // server-side).
    if (isRawInfraErrorCode(code)) {
      console.error(`[parseRpcError] ${code}:`, raw.message, raw.details ?? '');
      return new AppError('INTERNAL_ERROR', 'An unexpected error occurred. Please try again.');
    }
    return new AppError(
      (raw.code as RpcErrorCode) || 'UNKNOWN',
      raw.message || 'An unexpected database error occurred',
      raw.details || raw.hint,
    );
  }

  // Standard JS Error
  if (raw instanceof Error) {
    // Check for specific logic codes thrown manually
    if (raw.message === 'LOCK_CONTENTION') {
      return new AppError('LOCK_CONTENTION', 'In use — retry later');
    }
    // Check for timeout
    if (raw.message.includes('timeout') || raw.message.includes('504')) {
      return new AppError('RPC_TIMEOUT', 'Request timed out. Please try again.');
    }
    return new AppError('UNKNOWN', raw.message);
  }

  // String error
  if (typeof raw === 'string') {
    return new AppError('UNKNOWN', raw);
  }

  return new AppError('UNKNOWN', 'An unexpected error occurred');
}

/** Type guard for Supabase PostgrestError */
function isPostgresError(
  err: unknown,
): err is { code: string; message: string; details?: string; hint?: string } {
  return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

/**
 * Raw PG / PostgREST infrastructure code shapes. Our application-level RPC
 * codes are always UPPER_SNAKE_WORDS; Postgres SQLSTATE codes are 5 chars
 * (digits/letters, e.g. 23505, 42P01) and PostgREST codes are PGRSTnnn.
 * Anything matching these shapes carries an internal DB message → mask it.
 */
function isRawInfraErrorCode(code: string): boolean {
  return /^[0-9][0-9A-Z]{4}$/.test(code) || /^PGRST/i.test(code);
}
