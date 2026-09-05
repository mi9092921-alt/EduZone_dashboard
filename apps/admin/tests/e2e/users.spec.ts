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
    // Click on the first user row. NOT firstRow.click() -- Playwright
    // clicks the row's bounding-box center, which for this column layout
    // lands on the "Copy to clipboard" button inside the Contact Info
    // cell. That button calls e.stopPropagation() (see CopyButton in
    // UsersTable.tsx), so the click never reaches the <tr>'s
    // onClick={() => onViewProfile(user)} and the drawer never opens.
    // Confirmed via the failure screenshot: the copy tooltip is visible
    // exactly where the click landed. The "User" cell (avatar + name)
    // has no interactive children and no stopPropagation, so it's a
    // safe, reliable click target.
    const firstRow = page.getByRole('row').nth(1);
    await firstRow.getByRole('cell').nth(1).click();

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

  // Port of the Cypress "User Management: Lock User Flow (Cloud Safe)" spec
  // (cypress/e2e/users/lock-user.cy.ts). That version can't have been
  // passing as-is: it intercepts 'POST **/rest/v1/rpc/get_users_list*' and
  // 'POST **/rest/v1/rpc/admin_lock_user', drives a "Security" tab inside a
  // profile drawer, and confirms via a button named exactly 'Lock'. None of
  // that exists in src/:
  //  - The list query is a real GET filtered with
  //    `.or('email.ilike...,first_name.ilike...,last_name.ilike...')`
  //    (infrastructure/repos/users.service.ts), not an RPC named
  //    get_users_list.
  //  - Lock/Suspend/Ban/Warning open from the row's own kebab menu
  //    (UserRowActions.tsx) -- there is no Security tab anywhere in
  //    UserProfileDrawer.tsx.
  //  - The confirm button's accessible name is 'Lock Account'
  //    (confirmLabel in ActionDialogs.tsx's LockUserDialog), not 'Lock'.
  //  - The actual mutation (useMutateUserAccount ->
  //    controlUserAccountAction, adapters/mutations/users.mutations.ts /
  //    adapters/actions/user.actions.ts) is a Next.js Server Action. It
  //    calls the control_user_account RPC server-side with the
  //    service_role client (infrastructure/repos/user-admin.repository.ts)
  //    because v13 revoked that RPC's PUBLIC EXECUTE grant -- the call
  //    never appears as a '/rest/v1/rpc/...' request in the browser, so
  //    'POST **/rest/v1/rpc/admin_lock_user' could never have matched
  //    anything real. That also means this can't be tested by mocking the
  //    browser network layer the way auth.spec.ts's token-version test
  //    mocks check_dashboard_access -- there's nothing on that layer to
  //    intercept. This test instead drives the real, unmocked RPC against
  //    a disposable target and verifies the real result.
  test.describe('Lock / Unlock account (Cloud Safe)', () => {
    // No test.describe.configure({ mode: 'serial' }) here, unlike
    // auth.spec.ts's Login/Logout/Token-version trio. Those tests each
    // perform a fresh login/logout of their OWN session and had to be
    // serialized to stop concurrent runs from invalidating each other's
    // (or the shared setup session's) auth.sessions row. This test reuses
    // the shared 'playwright/.auth/user.json' session
    // (admin@eduzone-test.com) like the rest of this file and never calls
    // anything that touches its own session/JWT -- it only flips the
    // account_status of a DIFFERENT seeded user (see below), which none of
    // the other tests in this file assert on. Nothing here can race with
    // them.
    test('locks an active user from the row menu, then unlocks to restore seed state', async ({
      page,
    }) => {
      // ── Pick a target row that is safe to mutate ──────────────────
      // supabase/schema/11_seed_reference.sql (PHASE 4) seeds exactly 5
      // users into the EduZone QA tenant admin@eduzone-test.com belongs
      // to: Super Admin, Ali Hassan (admin -- the account this test is
      // logged in as; never touch your own session's row), Sara Mohamed
      // (teacher), Omar Abdullah (student, seeded 'active'), and Lina
      // Khalid (student2, seeded 'locked' -- a fixture other specs/manual
      // QA may rely on staying locked, so not a safe target here). Omar
      // Abdullah is the only active, non-self, non-fixture account in
      // that seed, which is what makes him safe to lock and unlock inside
      // one test without disturbing anything else.
      //
      // "Omar" is also a unique substring across every seeded name/email
      // in this tenant, so filtering the real search box narrows the
      // table to exactly this one row. keepPreviousData
      // (adapters/queries/users.queries.ts) keeps the full unfiltered
      // list on screen (no skeleton flash) until the filtered result
      // replaces it, so a plain `expect(...).toBeVisible()` retry already
      // covers the search box's 400ms debounce (UserFiltersBar.tsx) plus
      // the round trip -- no explicit network wait needed.
      await page.getByPlaceholder('Search users...').fill('Omar');

      const row = page.getByRole('row', { name: /Omar Abdullah/i });
      await expect(row).toBeVisible();
      await expect(row.getByRole('cell', { name: 'Active', exact: true })).toBeVisible();

      // ── Open the row's action menu and choose Lock ─────────────────
      // UserRowActions.tsx renders a real MUI Menu (role="menu"/
      // "menuitem"), opened by the button whose aria-label is
      // 'User Options' (t('actions_user_options')). That button's <td>
      // calls e.stopPropagation() (UsersTable.tsx), so clicking it does
      // NOT also fire the row's onClick and open the profile drawer.
      await row.getByRole('button', { name: 'User Options' }).click();
      await page.getByRole('menuitem', { name: 'Lock Account' }).click();

      // ── Confirm dialog ──────────────────────────────────────────────
      // ConfirmDialog (components/ui/ConfirmDialog.tsx) is a real MUI
      // Dialog (role="dialog") and, like MUI Menu, is only mounted while
      // open -- so scoping to it can't collide with the identically-
      // labelled 'Reason' field the Suspend/Ban/Warning dialogs would
      // also have, since those are unmounted right now.
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText("Lock Omar Abdullah's Account")).toBeVisible();

      // lockUserSchema (domain/schemas/user.schema.ts) requires 5-500
      // characters -- anything shorter fails client-side validation
      // before the mutation ever fires.
      await dialog
        .getByLabel('Reason')
        .fill('Suspicious activity flagged by automated E2E check');

      // The confirm button's accessible name is 'Lock Account'
      // (confirmLabel prop, ActionDialogs.tsx), the same text as the menu
      // item that opened this dialog -- scoping to the dialog (now the
      // menu is closed) is what keeps this unambiguous.
      await dialog.getByRole('button', { name: 'Lock Account' }).click();

      // ── Verify the real, unmocked result ────────────────────────────
      // Toast.tsx renders the global toast as a MUI Alert (role="alert").
      // lock_user_success in messages/en.json is "{name}'s account has
      // been locked."
      await expect(page.getByRole('alert')).toContainText(
        "Omar Abdullah's account has been locked.",
      );
      await expect(row.getByRole('cell', { name: 'Locked', exact: true })).toBeVisible();

      // ── Cloud-safe cleanup: restore the seed's 'active' state ───────
      // Unlock has no confirm dialog -- UsersPage.tsx's handleAction
      // calls unlock.mutate({ userId, action: 'unlock' }) directly -- and
      // fires no toast (no onSuccess callback is passed for the unlock
      // case), unlike every other account action here, so this step only
      // re-checks the row's status cell, not another alert. Restoring
      // Omar to 'active' as part of this test (rather than in a separate
      // afterEach) ties the restore step to this test's own pass/fail
      // signal and leaves the QA seed exactly as later specs, and reruns
      // of this one, expect to find it.
      await row.getByRole('button', { name: 'User Options' }).click();
      await page.getByRole('menuitem', { name: 'Unlock Account' }).click();
      await expect(row.getByRole('cell', { name: 'Active', exact: true })).toBeVisible();
    });
  });
});
