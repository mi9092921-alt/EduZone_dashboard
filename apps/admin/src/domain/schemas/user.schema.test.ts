import { describe, it, expect } from 'vitest';
import {
  createUserSchema,
  lockUserSchema,
  suspendUserSchema,
  banUserSchema,
  issueWarningSchema,
} from './user.schema';

describe('user domains schemas', () => {
  it('validates createUserSchema', () => {
    expect(createUserSchema.safeParse({ email: 'bad' }).success).toBe(false);
    expect(
      createUserSchema.safeParse({
        email: 'test@test.com',
        first_name: 'John',
        last_name: 'Doe',
      }).success
    ).toBe(true);
  });

  it('validates lockUserSchema', () => {
    expect(lockUserSchema.safeParse({ reason: '1' }).success).toBe(false);
    expect(lockUserSchema.safeParse({ reason: 'Valid reason' }).success).toBe(true);
  });

  it('validates suspendUserSchema', () => {
    expect(suspendUserSchema.safeParse({ reason: 'ok reason', suspend_hours: 0 }).success).toBe(false);
    expect(suspendUserSchema.safeParse({ reason: 'ok reason', suspend_hours: 48 }).success).toBe(true);
  });

  it('validates banUserSchema', () => {
    expect(banUserSchema.safeParse({ reason: 'ok reason', confirm_text: 'ban' }).success).toBe(false);
    expect(banUserSchema.safeParse({ reason: 'ok reason', confirm_text: 'BAN' }).success).toBe(true);
  });

  it('validates issueWarningSchema', () => {
    expect(issueWarningSchema.safeParse({ reason: 'short', severity: 1 }).success).toBe(false);
    expect(issueWarningSchema.safeParse({ reason: 'This is a valid long reason for a warning', severity: 2 }).success).toBe(true);
  });
});
