import type { UserRole } from '@eduzone/types';
import { describe, expect, it } from 'vitest';


import { NAV_ITEMS } from '@/config/nav.config';
import { ADMIN_ROLES, SEGMENT_ROLES, STAFF_ROLES } from '@/config/route-access.config';

/**
 * PHASE 2.5 (G1 regression lock): the client-side nav matrix (nav.config.ts)
 * and the server-side page-guard matrix (route-access.config.ts) must agree.
 * If they drift, a page becomes either over-exposed (nav hides it, server
 * allows it is fine — but nav SHOWS it, server denies it breaks UX) or
 * under-protected (nav shows an item whose segment the server would 404).
 */
describe('route-access lockstep (G1)', () => {
  it('every NAV_ITEMS path maps to a SEGMENT_ROLES entry with identical roles', () => {
    for (const item of NAV_ITEMS) {
      const segment = item.path === '/' ? 'dashboard' : item.path.replace(/^\//, '').split('/')[0];
      const serverRoles = SEGMENT_ROLES[segment as keyof typeof SEGMENT_ROLES];
      expect(serverRoles, `segment "${segment}" missing from SEGMENT_ROLES`).toBeDefined();
      expect([...serverRoles]).toEqual([...item.roles]);
    }
  });

  it('guards the segments that are not navigable (inbox/notifications) as staff-only', () => {
    for (const segment of ['inbox', 'notifications'] as const) {
      expect(SEGMENT_ROLES[segment]).toEqual(STAFF_ROLES);
    }
  });

  it('never grants students dashboard access (check_dashboard_access contract)', () => {
    for (const roles of Object.values(SEGMENT_ROLES)) {
      expect(roles).not.toContain('student');
    }
  });

  it('keeps the privileged segments super_admin-only', () => {
    for (const segment of ['jobs', 'tenants', 'flags'] as const) {
      expect(SEGMENT_ROLES[segment]).toEqual(['super_admin']);
    }
  });

  it('admin roles are a strict subset of staff roles', () => {
    expect(ADMIN_ROLES.every((role: UserRole) => STAFF_ROLES.includes(role))).toBe(true);
  });
});
