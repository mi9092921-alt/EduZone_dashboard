import { z } from 'zod';

/**
 * Zod schemas for user management actions.
 * Mirror the DB CHECK constraints from Eduzone Schema v5.
 */

export const accountActionSchema = z.enum(['lock', 'unlock', 'suspend', 'ban']);

export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  first_name: z.string().min(2, 'First name is required').max(50),
  last_name: z.string().min(2, 'Last name is required').max(50),
  phone: z.string().optional(),
  primary_role: z.enum(['super_admin', 'admin', 'teacher', 'student']).default('student'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const lockUserSchema = z.object({
  reason: z
    .string()
    .min(5, 'Reason must be at least 5 characters')
    .max(500, 'Reason cannot exceed 500 characters'),
});
export type LockUserInput = z.infer<typeof lockUserSchema>;

export const suspendUserSchema = z.object({
  reason: z
    .string()
    .min(5, 'Reason must be at least 5 characters')
    .max(500, 'Reason cannot exceed 500 characters'),
  suspend_hours: z
    .number({ invalid_type_error: 'Duration is required' })
    .int('Duration must be a whole number')
    .min(1, 'Minimum 1 hour')
    .max(720, 'Maximum 720 hours (30 days)'),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const banUserSchema = z.object({
  reason: z
    .string()
    .min(5, 'Reason must be at least 5 characters')
    .max(500, 'Reason cannot exceed 500 characters'),
  confirm_text: z.literal('BAN', {
    errorMap: () => ({ message: 'You must type BAN to confirm' }),
  }),
});
export type BanUserInput = z.infer<typeof banUserSchema>;

export const issueWarningSchema = z.object({
  reason: z
    .string()
    .min(20, 'Reason must be at least 20 characters')
    .max(1000, 'Reason cannot exceed 1000 characters'),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)], {
    errorMap: () => ({ message: 'Select a severity level' }),
  }),
  action: z.string().optional(),
});
export type IssueWarningInput = z.infer<typeof issueWarningSchema>;

export const terminateSessionsSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type TerminateSessionsInput = z.infer<typeof terminateSessionsSchema>;

export const resetDeviceSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm this action' }),
  }),
});
export type ResetDeviceInput = z.infer<typeof resetDeviceSchema>;
