import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.describe('Accessibility Audits', () => {
  test('dashboard should have no detectable a11y violations', async ({ page }) => {
    await page.goto('/activities');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('user list should have no detectable a11y violations', async ({ page }) => {
    await page.goto('/users');

    // Wait for the table to render. UsersTable.tsx renders a plain
    // semantic <table> (implicit role="table"), not an ARIA grid pattern
    // -- getByRole('grid') never matches it, regardless of timeout.
    await expect(page.getByRole('table')).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
