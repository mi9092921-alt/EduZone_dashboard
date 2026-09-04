import { test, expect } from '@playwright/test';

test.describe('Authentication & Session Heartbeat', () => {
  test.describe('Login flow', () => {
    // Use 'no-auth' for these tests as we want to test the flow itself
    test.use({ storageState: { cookies: [], origins: [] } });

    test('successfully logs in and redirects to dashboard', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel(/email/i).fill('admin@eduzone-test.com');
      // Canonical QA seed password (supabase/schema/11_seed_reference.sql,
      // supabase/AGENTS.md QA accounts table) -- "Password123" was never
      // a valid credential and always failed with "Invalid email or
      // password", which is why this test never got past /login.
      await page.getByLabel(/password/i).fill('Admin@12345');
      // The button's accessible name is "Sign In" (see
      // src/features/auth/components/LoginPage.tsx) -- "login" never
      // matched, which is why this click used to time out after 30s.
      await page.getByRole('button', { name: /sign in/i }).click();

      // Verify redirect
      await expect(page).toHaveURL(/.*activities/);

      // Verify the user menu is present. Its accessible name is the
      // user's email (see aria-label on #user-menu-button in
      // src/features/layout/components/Topbar.tsx), not "profile"/"user",
      // so target the stable id instead of guessing at a name.
      await expect(page.locator('#user-menu-button')).toBeVisible();
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

      // Click profile and logout (see note above on #user-menu-button)
      await page.locator('#user-menu-button').click();
      await page.getByRole('menuitem', { name: /logout/i }).click();

      // Should redirect back to login
      await expect(page).toHaveURL(/.*login/);
    });
  });
});
