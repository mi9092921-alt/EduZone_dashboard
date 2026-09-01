import { describe, it, expect } from 'vitest';

import { createRequestContext } from './context.types';

describe('RequestContext', () => {
  it('creates an immutable frozen RequestContext object', () => {
    const ctx = createRequestContext({
      userId: 'user-123',
      tenantId: 'tenant-456',
      role: 'admin',
      permissions: ['users.read', 'users.write'],
      requestId: 'req-789',
    });

    expect(ctx.userId).toBe('user-123');
    expect(ctx.tenantId).toBe('tenant-456');
    expect(ctx.role).toBe('admin');
    expect(ctx.permissions).toEqual(['users.read', 'users.write']);
    expect(ctx.requestId).toBe('req-789');

    // Verify immutability
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.permissions)).toBe(true);
  });
});
