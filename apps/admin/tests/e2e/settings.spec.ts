import { test, expect, type Page } from '@playwright/test';

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

// Port of cypress/e2e/settings/maintenance-mode.cy.ts ("Maintenance Mode
// Flow"). That version mocked the config GET/PATCH endpoints and guessed
// a single Maintenance switch that saves on toggle. The real UI is a
// 5-step MaintenanceWizard (status -> message -> deadline -> roles ->
// users -> submit; MaintenanceWizard.tsx) writing via enable/disable
// mutations (plain settings_kv upserts, settings.service.ts -- same
// transport correction as the app-lock port above documents).
//
// Cloud Safety: unlike notification/course rows (tenant data, invisible
// to other specs), maintenance_mode is GLOBAL -- enabling it for real
// makes check_dashboard_access deny fresh logins, which would break the
// parallel auth.spec.ts trio mid-run. So, exactly like the app-lock test
// above, the write is intercepted (GETs continue to the real backend;
// only the mutating settings_kv calls are fulfilled) while the FULL
// wizard interaction runs for real, and the test asserts the captured
// request payloads -- what the app WOULD persist -- plus wizard
// progression. Zero global side effects, zero restore needed.
test.describe('Maintenance mode wizard (Cloud Safe -- write mocked)', () => {
  async function openWizard(page: Page) {
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Maintenance', exact: true }).click();
    // Wizard header is hardcoded Arabic (MaintenanceWizard.tsx), the
    // step labels come from settings.maintenance_wizard.
    await expect(page.getByText('معالج وضع الصيانة')).toBeVisible();
  }

  // MUI Switch renders a plain checkbox input here (no switch role in
  // this tree), and step 0 carries exactly one of them.
  function wizardToggle(page: Page) {
    return page.locator('input[type="checkbox"]').first();
  }

  test('blocks advancing past Message with an empty message', async ({ page }) => {
    await openWizard(page);

    const wizardSwitch = wizardToggle(page);
    await expect(wizardSwitch).toBeVisible();
    if (!(await wizardSwitch.isChecked())) await wizardSwitch.check();

    await page.getByRole('button', { name: 'Next Step' }).click();

    // Step 1 (Message). NOTE (real i18n gap, same class as the missing
    // course-detail tab keys): the empty-message error uses
    // tVal('message_min'), which has NO entry in messages/en.json's
    // validation namespace -- so instead of asserting fallback text
    // that a translation fix would break, assert the wizard did NOT
    // advance: the Message field is still here and the final submit
    // ("Enable Maintenance", step 4 only) is still absent.
    // Step 1 (Message) starts prefilled from the seeded
    // maintenance_message ("Application is under maintenance.") --
    // clear it first so the empty check actually exercises.
    await expect(page.getByLabel('Message (Arabic)')).toBeVisible();
    await page.getByLabel('Message (Arabic)').fill('');
    await page.getByRole('button', { name: 'Next Step' }).click();
    await expect(page.getByLabel('Message (Arabic)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable Maintenance' })).toHaveCount(0);
  });

  test('walks the full wizard and submits the real enable payload', async ({ page }) => {
    await openWizard(page);

    const wizardSwitch = wizardToggle(page);
    if (!(await wizardSwitch.isChecked())) await wizardSwitch.check();

    await page.getByRole('button', { name: 'Next Step' }).click();
    await page.getByLabel('Message (Arabic)').fill('صيانة مجدولة لاختبار E2E');

    // Deadline (optional) and roles/users (optional) stay empty --
    // ends_at then defaults server-side to +24h.
    await page.getByRole('button', { name: 'Next Step' }).click();
    await page.getByRole('button', { name: 'Next Step' }).click();
    await page.getByRole('button', { name: 'Next Step' }).click();
    await expect(page.getByRole('button', { name: 'Enable Maintenance' })).toBeVisible();

    // Intercept the write (see the Cloud Safety note above): GETs pass
    // through so the page keeps reading real settings; the three
    // mutating upserts (mode/message/ends_at) are captured + fulfilled.
    const writeBodies: string[] = [];
    await page.route('**/rest/v1/settings_kv*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.continue();
        return;
      }
      writeBodies.push(route.request().postData() ?? '');
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    });

    await page.getByRole('button', { name: 'Enable Maintenance' }).click();

    // The wizard resets to step 0 on mutation success (setActiveStep(0)
    // in handleSubmit) -- the switch is visible again. By then every
    // captured body is already recorded (capture happens on request,
    // before the mocked response resolves the mutation).
    await expect(wizardToggle(page)).toBeVisible();
    expect(writeBodies.some((b) => b.includes('maintenance_mode'))).toBe(true);
    expect(writeBodies.some((b) => b.includes('maintenance_message'))).toBe(true);
    expect(writeBodies.some((b) => b.includes('maintenance_ends_at'))).toBe(true);
  });
});
