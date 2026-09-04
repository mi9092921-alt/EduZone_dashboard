import { test, expect } from '@playwright/test';

test.describe('Authentication & Session Heartbeat', () => {
  test.describe('Login flow', () => {
    // Use 'no-auth' for these tests as we want to test the flow itself
    test.use({ storageState: { cookies: [], origins: [] } });

    test('successfully logs in and redirects to dashboard', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel(/email/i).fill('admin@eduzone-test.com');
      await page.getByLabel(/password/i).fill('Password123');
      // The button's accessible name is "Sign In" (see
      // src/features/auth/components/LoginPage.tsx) -- "login" never
      // matched, which is why this click used to time out after 30s.
      await page.getByRole('button', { name: /sign in/i }).click();

      // Verify redirect
      await expect(page).toHaveURL(/.*activities/);

      // Verify toast or profile presence
      await expect(page.getByRole('button', { name: /profile|user/i })).toBeVisible();
    });
  });

  test.describe('Logout flow', () => {
    // test.use() cannot be called inside a test() body -- Playwright
    // rejects that at runtime. Since the outer describe's login-flow
    // test.use() above overrides the chromium project's default
    // authenticated storageState, this nested describe restores it for
    // the tests that need to start already logged in.
    test.use({ storageState: 'playwright/.auth/user.json' });

    test('logs out successfully', async ({ page }) => {
      await page.goto('/activities');

      // Click profile and logout
      await page.getByRole('button', { name: /profile|user/i }).click();
      await page.getByRole('menuitem', { name: /logout/i }).click();

      // Should redirect back to login
      await expect(page).toHaveURL(/.*login/);
    });
  });
});
