import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Go to login page
  await page.goto('/login');

  // Fill in credentials
  // Canonical QA seed account — supabase/schema/11_seed_reference.sql (v13):
  // admin@eduzone-test.com / Admin@12345 (see supabase/AGENTS.md QA accounts
  // table). The previous value ("Test1234!", referenced from a v9-era seed)
  // no longer matches the canonical seed hash and would fail login.
  await page.getByLabel(/email/i).fill('admin@eduzone-test.com');
  await page.getByLabel(/password/i).fill('Admin@12345');
  await page.getByRole('button', { name: /login|sign in/i }).click();

  // Wait for redirect to dashboard or localized home with generous timeout
  await expect(page).toHaveURL(/.*(dashboard|activities|en|ar)$/, { timeout: 20000 });

  // Wait for sidebar to be visible (evidence of successful auth)
  await expect(page.getByRole('navigation')).toBeVisible();

  // End of authentication steps
  await page.context().storageState({ path: authFile });
});
