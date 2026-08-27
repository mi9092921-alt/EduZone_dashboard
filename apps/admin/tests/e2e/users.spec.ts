import { test, expect } from '@playwright/test';

test.describe('User Management', () => {
  // Uses global auth state by default
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    // Ensure table is loaded
    await expect(page.getByRole('grid')).toBeVisible();
  });

  test('displays user list with correct columns', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: /user/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /role/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
  });

  test('can open user details dialog', async ({ page }) => {
    // Click on the first user row
    const firstRow = page.getByRole('row').nth(1);
    await firstRow.click();
    
    // Check if dialog or details drawer appears
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/account status/i)).toBeVisible();
  });

  test('filtering users by role', async ({ page }) => {
    // Open role filter
    await page.getByLabel(/filter role/i).selectOption('student');
    
    // Verify results show only students
    const roles = page.getByRole('cell', { name: 'student' });
    const otherRoles = page.getByRole('cell', { name: 'admin' });
    
    await expect(roles.first()).toBeVisible();
    await expect(otherRoles).toHaveCount(0);
  });
});
