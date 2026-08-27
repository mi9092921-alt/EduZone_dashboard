import type { RpcErrorCode } from './codes';
import { AppError } from './AppError';

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
    return new AppError(
      (raw.code as RpcErrorCode) || 'UNKNOWN',
      raw.message || 'An unexpected database error occurred',
      JSON.stringify({ 
        details: raw.details, 
        hint: raw.hint, 
        code: raw.code 
      }),
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
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'message' in err
  );
}
