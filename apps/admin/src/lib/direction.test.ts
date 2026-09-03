import { describe, it, expect, vi } from 'vitest';

vi.mock('next-intl/navigation', () => ({
  createNavigation: vi.fn(() => ({
    Link: vi.fn(),
    redirect: vi.fn(),
    usePathname: vi.fn(),
    useRouter: vi.fn(),
    getPathname: vi.fn(),
  })),
}));

import { getDir } from './direction';

describe('direction utility (RTL / LTR)', () => {
  it('returns rtl for Arabic locale', () => {
    expect(getDir('ar')).toBe('rtl');
  });

  it('returns ltr for English locale', () => {
    expect(getDir('en')).toBe('ltr');
  });

  it('falls back to ltr for unknown locales', () => {
    expect(getDir('fr')).toBe('ltr');
    expect(getDir('')).toBe('ltr');
  });
});
