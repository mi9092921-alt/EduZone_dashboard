import { test, expect } from '@playwright/test';

// Port of cypress/e2e/settings/app-lock.cy.ts ("Global App Lock Flow (Cloud
// Safe)"). Neither of that file's two tests could have been passing as
// written:
//
//  - It intercepts 'POST **/rest/v1/rpc/lock_app'. There is no lock_app RPC
//    anywhere in supabase/schema/ -- the real action
//    (infrastructure/repos/settings.service.ts's lockApp()) does two plain
//    REST upserts into settings_kv (key='app_locked', key='app_lock_message'),
//    not an RPC call.
//  - It drives a generic 'textarea, input[name="message"]' and a button
//    matching /Proceed|Lock/i. The real dialog (AppLockControl.tsx) is a MUI
//    TextField labelled "Lock Message" (t('settings.app_lock.label_message')),
//    and both the trigger and confirm buttons read "Lock System"
//    (t('...btn_lock')), not "App Lock" / "Proceed".
//  - Its second test mocks check_dashboard_access to return
//    { status: 'app_locked', ... } and expects a full-screen "Application
//    Locked" takeover. That's a different, real feature entirely --
//    check_dashboard_access's actual 'maintenance_mode' reason
//    (LoginPage.tsx) blocks *login*, and belongs to
//    cypress/e2e/settings/maintenance-mode.cy.ts, not this file. The real
//    'app_locked' setting this file is about only ever renders a dismissible
//    top banner inside AdminShell.tsx (useSetting('app_locked')) --
//    non-blocking, and visible to admins too, so they can get back into
//    Settings to unlock it.
test.describe('System Lock', () => {
  test('locks the system with a message and closes the dialog on success', async ({ page }) => {
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Lock System' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Lock System')).toBeVisible();

    // lockApp() (settings.service.ts) does two separate
    // supabase.from('settings_kv').upsert(...) calls -- one per key -- so
    // two requests hit this route, not one. Mocking rather than a real
    // write: 'app_locked' is a single global row, and fullyParallel: true
    // runs this alongside every other spec file against the same dev
    // server + Supabase instance -- a real write here would flip the
    // AdminShell banner (and, if this were the separate maintenance-mode
    // setting instead, block login outright) for all of them mid-run.
    let sawLockMessageInBody = false;
    await page.route('**/rest/v1/settings_kv*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.continue();
        return;
      }
      const body = route.request().postData() ?? '';
      if (body.includes('Playwright automated lockdown')) sawLockMessageInBody = true;
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    });

    await dialog.getByLabel('Lock Message').fill('Playwright automated lockdown');
    await dialog.getByRole('button', { name: 'Lock System' }).click();

    // No success toast exists for this action (checked messages/en.json's
    // settings.app_lock namespace and AppLockControl.tsx's handleLock --
    // neither calls a toast). On failure the dialog stays open with an
    // inline Alert (same pattern as the Lock/Unlock user dialog); closing
    // is the real, only success signal here.
    await expect(dialog).not.toBeVisible();
    expect(sawLockMessageInBody).toBe(true);
  });

  test('shows the locked banner across the admin shell when the system is locked', async ({
    page,
  }) => {
    // AdminShell.tsx reads this via useSetting('app_locked') ->
    // supabase.from('settings_kv').select('value').eq('key', 'app_locked')
    // .maybeSingle() -- a plain GET, PostgREST's single-object Accept
    // header returns a bare object, not an array. Scoped to
    // key=eq.app_locked specifically so every *other* settings_kv read the
    // rest of the page needs (general settings, other maintenance keys)
    // still hits the real backend.
    await page.route('**/rest/v1/settings_kv*key=eq.app_locked*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ value: 'true' }),
      }),
    );

    await page.goto('/users');

    await expect(
      page.getByRole('alert').filter({
        hasText: 'System is currently locked for all users — unlock it in Settings page',
      }),
    ).toBeVisible();
  });
});
