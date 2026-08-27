import { describe, it, expect } from 'vitest';
import { parseRpcError } from './parseRpcError';
import { AppError } from './AppError';

describe('parseRpcError', () => {
  it('should return the same AppError if passed an AppError', () => {
    const error = new AppError('AUTH_REQUIRED', 'Custom message', 'Details');
    const result = parseRpcError(error);
    expect(result).toBe(error);
  });

  it('should parse a Supabase PostgrestError correctly', () => {
    const rawError = {
      code: 'AUTH_REQUIRED',
      message: 'Token expired',
      details: 'Trace ID: 123',
    };
    const result = parseRpcError(rawError);
    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe('AUTH_REQUIRED');
    expect(result.message).toBe('Token expired');
    expect(result.detail).toBe('Trace ID: 123');
  });

  it('should fallback to UNKNOWN for PostgrestError without code', () => {
    const rawError = {
      code: '',
      message: 'Some error without code',
      hint: 'Try again',
    };
    const result = parseRpcError(rawError as any);
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('Some error without code');
    expect(result.detail).toBe('Try again');
  });

  it('should parse standard JS Error as UNKNOWN', () => {
    const error = new Error('Client side crash');
    const result = parseRpcError(error);
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('Client side crash');
  });

  it('should map timeout/504 errors to RPC_TIMEOUT', () => {
    const error1 = new Error('fetch failed: timeout exceeded');
    expect(parseRpcError(error1).code).toBe('RPC_TIMEOUT');

    const error2 = new Error('HTTP 504 Gateway Timeout');
    expect(parseRpcError(error2).code).toBe('RPC_TIMEOUT');
  });

  it('should handle string errors', () => {
    const result = parseRpcError('Unexpected fail');
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('Unexpected fail');
  });

  it('should handle completely unknown shapes gracefully', () => {
    const result = parseRpcError({ random: 123 });
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('An unexpected error occurred');
  });

  it('should parse all known RpcErrorCode values correctly', () => {
    const codes = [
      'ADMIN_ONLY', 'INVALID_ACTION', 'RPC_TIMEOUT', 'DB_ERROR', 'USER_NOT_FOUND',
      'NO_DEVICES', 'PERMISSION_DENIED', 'AUTO_SUSPEND', 'DUPLICATE', 'COURSE_NOT_FOUND',
      'ALREADY_REVOKED', 'NOT_FOUND', 'SETTING_NOT_FOUND', 'INVALID_TYPE', 'ENDS_AT_PAST',
      'LOCK_CONTENTION', 'NO_JOBS', 'AUTH_REQUIRED', 'INVALID_DEVICE_ID',
      'DEVICE_ALREADY_BOUND', 'MAX_DEVICES_REACHED', 'RATE_LIMITED', 'PAYLOAD_TOO_LARGE',
      'INVALID_FILTERS', 'JOB_QUEUE_FULL', 'PARTIAL_FAILURE', 'JOB_TIMED_OUT', 
      'DRY_RUN_ZERO', 'NO_PUBLISHED_SECTIONS', 'STUDENT_NOT_ENROLLED', 'EMPTY_RESULT',
      'INTERNAL_ERROR', 'UNKNOWN'
    ];
    codes.forEach(code => {
      const result = parseRpcError({ code, message: 'msg' });
      expect(result.code).toBe(code);
    });
  });
});
