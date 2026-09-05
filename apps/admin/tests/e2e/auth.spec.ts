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

      // Verify redirect. LoginPage.tsx calls router.push('/') on success
      // (see src/features/auth/components/LoginPage.tsx), which the
      // locale middleware resolves to /en or /ar -- there is no redirect
      // to /activities anywhere in the app, so that pattern never matched
      // the real post-login URL.
      await expect(page).toHaveURL(/\/(en|ar)\/?$/);

      // Verify the user menu is present. Its accessible name is the
      // user's email (see aria-label on #user-menu-button in
      // src/features/layout/components/Topbar.tsx), not "profile"/"user",
      // so target the stable id instead of guessing at a name.
      await expect(page.locator('#user-menu-button')).toBeVisible();
    });
  });

  test.describe('Logout flow', () => {
    // Do NOT reuse the shared 'playwright/.auth/user.json' storageState
    // here. That snapshot is the SAME real Supabase Auth session used by
    // every other test in the chromium project (auth.setup.ts logs in
    // once and every test loads a copy of those cookies). Calling the
    // real logout action -- logout_current_user() bumps token_version
    // and revokes the row in auth.sessions for auth.uid(), see
    // supabase/schema/07_functions.sql -- revokes that session for the
    // whole account, not just this browser context. With
    // fullyParallel: true this was intermittently killing whichever
    // sibling tests (users.spec.ts, other auth.spec.ts assertions, ...)
    // happened to still be using that shared session, since their
    // supabase.auth.getUser() calls would start failing mid-run.
    // Logging in fresh here (same flow as the 'Login flow' test above)
    // gives this test its own independent session/JWT, so the real
    // logout it performs only revokes that private session.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('logs out successfully', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill('admin@eduzone-test.com');
      await page.getByLabel(/password/i).fill('Admin@12345');
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/(en|ar)\/?$/);

      await page.goto('/activities');

      // Click profile and logout (see note above on #user-menu-button)
      await page.locator('#user-menu-button').click();
      await page.getByRole('menuitem', { name: /logout/i }).click();

      // Should redirect back to login
      await expect(page).toHaveURL(/.*login/);
    });
  });
});
