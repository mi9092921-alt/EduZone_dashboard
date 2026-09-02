import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AppError } from './AppError';
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  errorStatus,
  toClientMessage,
} from './taxonomy';

describe('error taxonomy (M10)', () => {
  it('every taxonomy error is an AppError with the right code', () => {
    expect(new ValidationError('bad input').code).toBe('INVALID_TYPE');
    expect(new UnauthorizedError().code).toBe('AUTH_REQUIRED');
    expect(new ForbiddenError().code).toBe('PERMISSION_DENIED');
    expect(new NotFoundError('Course').code).toBe('NOT_FOUND');
    expect(new ConflictError('already exists').code).toBe('DUPLICATE');
    expect(new InfrastructureError().code).toBe('INTERNAL_ERROR');

    for (const err of [
      new ValidationError('x'),
      new UnauthorizedError(),
      new ForbiddenError(),
      new NotFoundError('x'),
      new ConflictError('x'),
      new InfrastructureError(),
    ]) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('maps taxonomy classes to the §14 HTTP status matrix', () => {
    expect(errorStatus(new ValidationError('x'))).toBe(400);
    expect(errorStatus(new UnauthorizedError())).toBe(401);
    expect(errorStatus(new ForbiddenError())).toBe(403);
    expect(errorStatus(new NotFoundError('x'))).toBe(404);
    expect(errorStatus(new ConflictError('x'))).toBe(409);
    expect(errorStatus(new InfrastructureError())).toBe(500);
    expect(errorStatus(new AppError('UNKNOWN', 'x'))).toBe(500);
    expect(errorStatus(new Error('raw'))).toBe(500);
    expect(errorStatus('weird')).toBe(500);
  });

  it('does not leak internal details through the client-facing message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const infra = new InfrastructureError(
      undefined,
      'relation "users" does not exist: SELECT * from postgres.public.users',
    );
    expect(infra.message).not.toContain('relation');
    expect(infra.message).not.toContain('SELECT');
    expect(infra.message).toBe('An unexpected error occurred. Please try again.');

    const notFound = new NotFoundError('Setting', 'PGRST116 from settings_kv');
    expect(notFound.message).toBe('Setting not found');
    expect(notFound.message).not.toContain('PGRST116');

    spy.mockRestore();
  });

  it('toClientMessage passes through authored AppError messages', () => {
    expect(toClientMessage(new ForbiddenError('Super admin only'))).toBe('Super admin only');
    expect(toClientMessage(new AppError('LOCK_CONTENTION', 'In use — retry later'))).toBe(
      'In use — retry later',
    );
  });

  it('toClientMessage extracts Zod issue messages', () => {
    const schema = z.object({ n: z.number().min(1) });
    const result = schema.safeParse({ n: 0 });
    expect(result.success).toBe(false);
    const message = toClientMessage(result.success === false ? result.error : null);
    expect(message).toContain('Number must be greater than or equal to 1');
  });

  it('toClientMessage masks unknown/raw error shapes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toClientMessage(new Error('duplicate key value violates unique constraint'))).not.toBe(
      'duplicate key value violates unique constraint',
    );
    expect(toClientMessage({ code: '23505', message: 'duplicate key' })).not.toContain('duplicate');
    expect(toClientMessage('some raw pg text')).not.toContain('pg');
    spy.mockRestore();
  });
});
