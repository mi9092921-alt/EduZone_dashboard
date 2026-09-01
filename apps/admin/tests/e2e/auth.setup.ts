import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Go to login page
  await page.goto('/login');

  // Fill in credentials
  // Note: Using seed data from Eduzone_schema_v9.sql
  await page.getByLabel(/email/i).fill('admin@eduzone-test.com');
  await page.getByLabel(/password/i).fill('Test1234!'); // Correct password from schema seed
  await page.getByRole('button', { name: /login|sign in/i }).click();

  // Wait for redirect to dashboard or localized home with generous timeout
  await expect(page).toHaveURL(/.*(dashboard|activities|en|ar)$/, { timeout: 20000 });

  // Wait for sidebar to be visible (evidence of successful auth)
  await expect(page.getByRole('navigation')).toBeVisible();

  // End of authentication steps
  await page.context().storageState({ path: authFile });
});
