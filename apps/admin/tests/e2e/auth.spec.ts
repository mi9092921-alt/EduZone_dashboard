import { test, expect } from '@playwright/test';

test.describe('Authentication & Session Heartbeat', () => {
  test.describe('Login flow', () => {
    // Use 'no-auth' for these tests as we want to test the flow itself
    test.use({ storageState: { cookies: [], origins: [] } });

    test('successfully logs in and redirects to dashboard', async ({ page }) => {
      await page.goto('/login');

      // Use a QA account DIFFERENT from the one auth.setup.ts uses
      // (admin@eduzone-test.com), not just a different password. This
      // test performs a real, fresh login, and public.sessions has an
      // AFTER INSERT trigger -- trg_sessions_management ->
      // trg_enforce_single_active_session() (supabase/schema/08_triggers.sql,
      // 07_functions.sql) -- that deactivates the PREVIOUS session for
      // that same user_id on every new login, not just on logout. With
      // fullyParallel: true, this real login was silently invalidating
      // the shared 'playwright/.auth/user.json' session (the same
      // admin@eduzone-test.com account) that users.spec.ts, a11y.spec.ts
      // and ux-regression.spec.ts all depend on, redirecting them to
      // /login mid-run. super_admin@eduzone-test.com is a separate QA
      // account (same tenant, supabase/AGENTS.md QA accounts table) so
      // this test's own login/logout cycle can never step on that
      // shared session, however the two run relative to each other.
      await page.getByLabel(/email/i).fill('super_admin@eduzone-test.com');
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
    //
    // That independent session still needs to be on a DIFFERENT QA
    // account than the shared one, though: public.sessions' AFTER INSERT
    // trigger (trg_sessions_management -> trg_enforce_single_active_session,
    // supabase/schema/08_triggers.sql, 07_functions.sql) deactivates the
    // PREVIOUS session for that user_id on every fresh login too, not
    // just on logout -- so logging in fresh here with
    // admin@eduzone-test.com would still kill the shared setup session
    // the instant this test's login completes, before logout is even
    // called. super_admin@eduzone-test.com (same tenant, supabase/AGENTS.md
    // QA accounts table) avoids that collision entirely.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('logs out successfully', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill('super_admin@eduzone-test.com');
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
