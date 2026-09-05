import { test, expect } from '@playwright/test';

test.describe('User Management', () => {
  // Uses global auth state by default

  test.beforeEach(async ({ page }) => {
    await page.goto('/users');
    // Ensure table is loaded. UsersTable.tsx renders a plain semantic
    // <table> (implicit role="table"), not an ARIA grid pattern.
    await expect(page.getByRole('table')).toBeVisible();

    // The table shell above renders immediately, but while isLoading is
    // true its <tbody> holds animate-pulse SKELETON rows -- plain <tr>
    // with no onClick and no real form controls (just decorative <div>s,
    // see UsersTable.tsx's skeletonRows.map branch). Real data rows
    // (UserRow) are what carry onClick={() => onViewProfile(user)} and a
    // genuine <input type="checkbox">. Without waiting for that, a test
    // can click a skeleton row that does nothing (never opens the
    // profile drawer) depending on how fast data arrives.
    await expect(page.getByRole('row').nth(1).getByRole('checkbox')).toBeVisible();
  });

  test('displays user list with correct columns', async ({ page }) => {
    // exact: true -- the select-all checkbox's <th> has
    // aria-label={t('select_all_users')} (UsersTable.tsx), so the loose
    // /user/i pattern matched both it and the real "User" column header.
    await expect(page.getByRole('columnheader', { name: 'User', exact: true })).toBeVisible();
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
    // Open role filter. This is a MUI Select rendered as
    // role="combobox" (see UserFiltersBar.tsx), not a native <select>,
    // so .selectOption() never applies here -- click to open the
    // listbox, then click the option.
    await page.getByRole('combobox', { name: /^role$/i }).click();
    await page.getByRole('option', { name: /student/i }).click();

    // Verify results show only students
    const roles = page.getByRole('cell', { name: 'student' });
    const otherRoles = page.getByRole('cell', { name: 'admin' });

    await expect(roles.first()).toBeVisible();
    await expect(otherRoles).toHaveCount(0);
  });
});
