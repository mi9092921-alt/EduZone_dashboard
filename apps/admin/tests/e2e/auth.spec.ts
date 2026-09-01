import { test, expect } from '@playwright/test';

test.describe('Authentication & Session Heartbeat', () => {
  // Use 'no-auth' for these tests as we want to test the flow itself
  test.use({ storageState: { cookies: [], origins: [] } });

  test('successfully logs in and redirects to dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill('admin@eduzone-test.com');
    await page.getByLabel(/password/i).fill('Password123');
    await page.getByRole('button', { name: /login/i }).click();

    // Verify redirect
    await expect(page).toHaveURL(/.*activities/);

    // Verify toast or profile presence
    await expect(page.getByRole('button', { name: /profile|user/i })).toBeVisible();
  });

  test('logs out successfully', async ({ page }) => {
    // Start with logged in state (using the setup state)
    test.use({ storageState: 'playwright/.auth/user.json' });

    await page.goto('/activities');

    // Click profile and logout
    await page.getByRole('button', { name: /profile|user/i }).click();
    await page.getByRole('menuitem', { name: /logout/i }).click();

    // Should redirect back to login
    await expect(page).toHaveURL(/.*login/);
  });
});
