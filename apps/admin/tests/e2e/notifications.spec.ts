import { test, expect } from '@playwright/test';

// Port of the Cypress "Notifications Flow" spec
// (cypress/e2e/notifications/notifications-flow.cy.ts). That version
// faked auth via localStorage, mocked the list/permissions queries,
// and mocked the send/delete RPCs -- then asserted a "Success" banner
// and request bodies against its own mocks. The real flow
// (NotificationsPage.tsx) is: 'Send New' button -> SendNotificationDialog
// (title/body/audience, zod-validated) -> sendNotificationAction Server
// Action -> toast + row. Delete is a row IconButton -> ConfirmDialog
// ('Delete Notification') -> deleteNotificationAction -> toast + row
// gone. Server Actions leave no browser-visible RPC to intercept (same
// as the users lock/warn flows), so toasts + row transitions are the
// verifiable result.
test.describe('Notifications send & delete', () => {
  // Uses global auth state by default (admin@eduzone-test.com -- holds
  // notifications.send/delete in seed role_permissions).

  test.beforeEach(async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    // MUI table shell renders immediately; skeleton rows carry no
    // text. The Send action proves nothing about data, so wait for the
    // table itself -- row-level waits happen per test below.
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('rejects an empty notification without submitting', async ({ page }) => {
    await page.getByRole('button', { name: 'Send New', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Send Notification')).toBeVisible();

    // Opener ('Send New', btn_send_new) and submit ('Send', btn_send)
    // differ, so no scoping ambiguity here.
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();

    // sendNotificationSchema (inline in NotificationsPage.tsx):
    // title min 3, body min 10. Nothing is submitted -- the Server
    // Action never fires on client-side validation failure.
    await expect(dialog.getByText(/at least 3/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('sends a notification with a unique title, then deletes it to restore seed state', async ({
    page,
  }) => {
    // ── Unique title: isolates parallel runs and CI retries ──────
    // No other spec touches notifications; each attempt gets its own
    // row, matched exactly below, so leftovers from a failed attempt
    // can neither collide nor confuse.
    const title = `E2E Notice ${Date.now()}`;

    await page.getByRole('button', { name: 'Send New', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Send Notification')).toBeVisible();

    // Audience stays at its default (first allowed = 'all' for admin)
    // -- only the required fields are exercised.
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Message Content').fill('Automated E2E port check -- safe to delete.');
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();

    // status_success is "Notification sent successfully"
    // (messages/en.json) -- same alert scoping as the users specs.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Notification sent successfully' }),
    ).toBeVisible();
    await expect(dialog).toBeHidden();

    // The new row is the real result (newest first).
    const row = page.getByRole('row', { name: title });
    await expect(row).toBeVisible();

    // ── Restore: delete the notification just sent ────────────────
    // Row delete is an IconButton labelled 'Delete' (btn_delete),
    // gated by notifications.delete (PermissionGate) which the admin
    // session holds.
    await row.getByRole('button', { name: 'Delete' }).click();

    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog.getByText('Delete Notification')).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();

    // status_delete_success is "Notification deleted".
    await expect(
      page.getByRole('alert').filter({ hasText: 'Notification deleted' }),
    ).toBeVisible();
    await expect(deleteDialog).toBeHidden();

    // Seed state restored: the row is gone.
    await expect(page.getByRole('row', { name: title })).toHaveCount(0);
  });
});
