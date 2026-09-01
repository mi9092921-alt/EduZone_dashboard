import { describe, it, expect } from 'vitest';

import { roleAllowsPermission } from './policy';

// Regression coverage for the P1-SEC-005 dedup: this allowlist used to be
// copy-pasted independently in three call sites (bulk-action/route.ts,
// user.actions.ts, admin.actions.ts) with no shared test, so a change to
// one copy could silently drift from the others. These cases pin the
// behavior all three callers previously relied on.
describe('roleAllowsPermission', () => {
  it('allows admin everything except tenants.manage', () => {
    expect(roleAllowsPermission('admin', 'users.write')).toBe(true);
    expect(roleAllowsPermission('admin', 'tenants.manage')).toBe(false);
  });

  it('restricts teacher to the fixed allowlist', () => {
    expect(roleAllowsPermission('teacher', 'courses.write')).toBe(true);
    expect(roleAllowsPermission('teacher', 'warnings.write')).toBe(true);
    expect(roleAllowsPermission('teacher', 'users.write')).toBe(false);
    expect(roleAllowsPermission('teacher', 'tenants.manage')).toBe(false);
  });

  it('restricts student to read-only course/report access', () => {
    expect(roleAllowsPermission('student', 'courses.read')).toBe(true);
    expect(roleAllowsPermission('student', 'reports.read')).toBe(true);
    expect(roleAllowsPermission('student', 'courses.write')).toBe(false);
  });

  it('denies unknown or missing roles by default', () => {
    expect(roleAllowsPermission(undefined, 'courses.read')).toBe(false);
    expect(roleAllowsPermission('some_unrecognized_role', 'courses.read')).toBe(false);
  });

  it('accepts an array of permissions and matches on any (OR)', () => {
    expect(roleAllowsPermission('teacher', ['tenants.manage', 'courses.read'])).toBe(true);
    expect(roleAllowsPermission('student', ['tenants.manage', 'users.write'])).toBe(false);
  });

  it('does not special-case super_admin (callers short-circuit it before calling)', () => {
    expect(roleAllowsPermission('super_admin', 'tenants.manage')).toBe(false);
  });
});
