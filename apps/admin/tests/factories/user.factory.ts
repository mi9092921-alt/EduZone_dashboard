import type { User } from '@/domain/types/user.types';
import type { AccountStatus, PrimaryRole } from '@/domain/types/user.types';

// ── Shared seeds ─────────────────────────────────────────────────
const MOCK_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_REGION_ID = 'region-eg-01';

let _counter = 1;
function nextId(): string {
  const hex = (_counter++).toString(16).padStart(12, '0');
  return `00000000-0000-0000-0000-${hex}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * User factory — builds realistic User objects for tests.
 * All fields are deterministic overrides on top of sensible defaults.
 *
 * @example
 * const student = userFactory.build({ primary_role: 'teacher' });
 * const users   = userFactory.buildList(5, { account_status: 'locked' });
 */
export const userFactory = {
  build(overrides: Partial<User> = {}): User {
    const id = nextId();
    const base: User = {
      id,
      tenant_id: MOCK_TENANT_ID,
      email: `user-${id.slice(-4)}@test.eduzone.com`,
      phone: null,
      first_name: 'Test',
      last_name: `User${id.slice(-4)}`,
      avatar_url: null,
      primary_role: 'student' as PrimaryRole,
      account_status: 'active' as AccountStatus,
      lock_reason: null,
      locked_at: null,
      locked_by: null,
      suspension_until: null,
      token_version: 1,
      region_id: MOCK_REGION_ID,
      shard_key: 1,
      warning_count: 0,
      timezone: 'UTC',
      locale: 'en',
      last_login: isoNow(),
      last_seen_at: isoNow(),
      login_count: 1,
      created_at: isoNow(),
      updated_at: isoNow(),
      deleted_at: null,
    };
    return { ...base, ...overrides };
  },

  buildList(n: number, overrides: Partial<User> = {}): User[] {
    return Array.from({ length: n }, () => userFactory.build(overrides));
  },

  /** Convenience: pre-locked user */
  locked(overrides: Partial<User> = {}): User {
    return userFactory.build({
      account_status: 'locked',
      lock_reason: 'Suspicious activity',
      locked_at: isoNow(),
      locked_by: '00000000-0000-0000-0000-000000000099',
      ...overrides,
    });
  },

  /** Convenience: suspended user */
  suspended(hours = 48, overrides: Partial<User> = {}): User {
    return userFactory.build({
      account_status: 'suspended',
      lock_reason: 'Policy violation',
      suspension_until: new Date(Date.now() + hours * 3_600_000).toISOString(),
      ...overrides,
    });
  },

  /** Convenience: banned user */
  banned(overrides: Partial<User> = {}): User {
    return userFactory.build({
      account_status: 'banned',
      lock_reason: 'Permanent violation',
      ...overrides,
    });
  },

  /** Convenience: user near auto-suspend (2 warnings) */
  nearAutoSuspend(overrides: Partial<User> = {}): User {
    return userFactory.build({ warning_count: 2, ...overrides });
  },
};
