import { describe, it, expect } from 'vitest';

import {
  getSetSettingSchema,
  getMaintenanceModeSchema,
  getCreateFeatureFlagSchema,
} from './settings.schema';

const mockT = (key: string) => key;

describe('settings domain schemas', () => {
  it('validates setting schema', () => {
    const s = getSetSettingSchema(mockT);
    expect(s.safeParse({ key: '', value: 'val' }).success).toBe(false);
    expect(s.safeParse({ key: 'k', value: 'val' }).success).toBe(true);
  });

  it('validates maintenance mode schema', () => {
    const s = getMaintenanceModeSchema(mockT);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);

    expect(s.safeParse({ message: 'bad', ends_at: futureDate.toISOString() }).success).toBe(false); // short message
    expect(
      s.safeParse({ message: 'Valid message here', ends_at: '2020-01-01T00:00:00.000Z' }).success,
    ).toBe(false); // past date
    expect(
      s.safeParse({ message: 'Valid message here', ends_at: futureDate.toISOString() }).success,
    ).toBe(true);
  });

  it('validates feature flag schema', () => {
    const s = getCreateFeatureFlagSchema(mockT);
    expect(s.safeParse({ key: '123_invalid' }).success).toBe(false); // bad regex
    expect(s.safeParse({ key: 'a', rollout_pct: 150 }).success).toBe(false); // short key & high pct
    expect(s.safeParse({ key: 'valid_flag', rollout_pct: 50 }).success).toBe(true);
  });
});
