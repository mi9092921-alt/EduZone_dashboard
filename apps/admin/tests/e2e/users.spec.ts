import { test, expect, type Page } from '@playwright/test';

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
      //
      // Scoped with .filter({ hasText }) instead of a bare getByRole('alert')
      // -- Next.js's own route announcer (a hidden, always-present
      // <div role="alert" id="__next-route-announcer__">, injected by the
      // App Router itself for a11y) also matches that role, and can be
      // non-empty right after a client-side navigation, making an unscoped
      // locator resolve to two elements. Same pattern already used in
      // settings.spec.ts for this exact collision.
      await expect(
        page.getByRole('alert').filter({ hasText: 'Omar Abdullah' }),
      ).toContainText("Omar Abdullah's account has been locked.");
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

  // Port of the Cypress "User Management: Ban User Flow (Cloud Safe)" spec
  // (cypress/e2e/users/ban-user.cy.ts) -- same category of stale
  // selectors/mocks as lock-user.cy.ts had (a "Security" tab and
  // `**/rest/v1/rpc/*ban*` intercepts that don't exist in src/; the real
  // mutation is the same service_role Server Action as lock/unlock).
  //
  // Unlike Lock, Ban has no reverse action anywhere in this app --
  // UserRowActions.tsx renders only Lock, Unlock, Suspend, and Ban, and
  // there is no corresponding "unban" account_status or menu item. That
  // makes a real ban permanent from the UI's own perspective, so -- unlike
  // the Lock/Unlock round trip above -- this test never actually submits
  // a valid ban: it drives the dialog up to and past the confirmation
  // check, then cancels.
  //
  // That validation step is also the real reason this port exists:
  // banUserSchema (domain/schemas/user.schema.ts) requires confirm_text to
  // literally equal 'BAN', but messages/en.json's
  // ban_confirm_label/ban_confirm_placeholder told the user to type
  // "CONFIRM" -- typing exactly what the dialog itself asked for could
  // never have passed validation. Fixed alongside this test (see
  // messages/en.json and messages/ar.json, both changed from "CONFIRM" to
  // "BAN"); this test is what catches that regressing.
  test.describe('Ban account confirmation text (Cloud Safe -- never submits)', () => {
    test('rejects the old placeholder text, accepts the real one, then cancels without banning', async ({
      page,
    }) => {
      // Sara Mohamed (teacher) -- distinct from Omar Abdullah, whom the
      // Lock/Unlock test above mutates. This test never changes any row's
      // state (it cancels instead of submitting), but targeting a
      // different seeded user keeps it independent of that test's timing
      // regardless.
      await page.getByPlaceholder('Search users...').fill('Sara');
      const row = page.getByRole('row', { name: /Sara Mohamed/i });
      await expect(row).toBeVisible();

      await row.getByRole('button', { name: 'User Options' }).click();
      await page.getByRole('menuitem', { name: 'Ban Account' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Ban Sara Mohamed')).toBeVisible();

      // banUserSchema also requires a 5-500 char reason -- fill it first
      // so the confirm-text assertions below are isolated to the one
      // field this test actually cares about.
      await dialog.getByLabel('Reason').fill('E2E validation check -- never submitted');

      // ── The actual bug: the dialog said "CONFIRM", the schema required
      // "BAN". Typing exactly what the (buggy) placeholder asked for must
      // fail, not silently succeed.
      await dialog.getByLabel('Type BAN to proceed').fill('CONFIRM');
      await dialog.getByRole('button', { name: 'Ban Permanently' }).click();
      await expect(dialog.getByText('You must type BAN to confirm')).toBeVisible();
      // Still on the dialog -- nothing was submitted, so no toast fired.
      await expect(page.getByRole('alert')).toHaveCount(0);

      // ── The real, correct value clears the error ──────────────────────
      await dialog.getByLabel('Type BAN to proceed').fill('BAN');
      await expect(dialog.getByText('You must type BAN to confirm')).toHaveCount(0);

      // ── Cancel instead of submitting -- Ban has no undo in this app ───
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      await expect(row.getByRole('cell', { name: 'Active', exact: true })).toBeVisible();
    });
  });

  // Port of the Cypress "User Management: Suspend User Flow (Cloud Safe)"
  // spec (cypress/e2e/users/suspend-user.cy.ts) -- same category of stale
  // fixtures as lock-user/ban-user had (a "Security" tab, a bare
  // `**/rest/v1/rpc/*suspend*` intercept, and a button literally named
  // "Suspend" that don't exist in src/; the real mutation is the same
  // service_role Server Action as lock/unlock/ban). The old spec also
  // never actually filled in a duration -- its own comments admit the
  // 48-hour selection step was guessed at and left commented out.
  //
  // Like Ban, Suspend has no reverse action anywhere in this app --
  // UserRowActions.tsx only ever shows "Suspend Account" while
  // account_status !== 'suspended', with no corresponding "unsuspend" menu
  // item for when it is. (SuspendUserDialog does accept a suspend_hours
  // duration after which the suspension would presumably lapse on its own,
  // but there's no UI path to reverse it immediately.) So, like the Ban
  // port, this never actually submits: it exercises the two pieces of real
  // client-side behaviour worth locking down -- the suspend_hours bounds
  // from suspendUserSchema (domain/schemas/user.schema.ts: 1-720) and the
  // live "Suspended until {date}" preview (ActionDialogs.tsx watches the
  // field and recomputes it) -- then cancels.
  test.describe('Suspend duration validation (Cloud Safe -- never submits)', () => {
    test('rejects an out-of-range duration, shows the live preview for a valid one, then cancels', async ({
      page,
    }) => {
      // Sara Mohamed -- same target as the Ban port above. Neither test
      // ever submits a mutation, so both reading her row in parallel is
      // safe regardless of worker scheduling.
      await page.getByPlaceholder('Search users...').fill('Sara');
      const row = page.getByRole('row', { name: /Sara Mohamed/i });
      await expect(row).toBeVisible();

      await row.getByRole('button', { name: 'User Options' }).click();
      await page.getByRole('menuitem', { name: 'Suspend Account' }).click();

      const dialog = page.getByRole('dialog');
      // suspend_user_title in messages/en.json is "Suspend {name}".
      await expect(dialog.getByText('Suspend Sara Mohamed')).toBeVisible();

      // The Reason field reuses lock_reason_label ("Reason") -- same as
      // the Lock dialog -- scoped to this dialog since Ban/Lock's own
      // "Reason" fields are unmounted right now.
      await dialog.getByLabel('Reason').fill('Policy violation flagged by automated E2E check');

      // ── The real bug surface: suspend_hours bounds (1-720) ─────────
      // The <input type="number" min={1} max={720}> only affects the
      // browser's spinner/:invalid styling, not what .fill() can enter or
      // what the app accepts -- suspendUserSchema (zodResolver) is the
      // actual gate. 0 is below the schema's min(1).
      await dialog.getByLabel('Duration (Hours)').fill('0');
      await dialog.getByRole('button', { name: 'Suspend User' }).click();
      await expect(dialog.getByText('Minimum 1 hour')).toBeVisible();
      // Still on the dialog -- nothing was submitted, so no toast fired.
      await expect(page.getByRole('alert')).toHaveCount(0);

      // ── A valid value clears the error and drives the live preview ──
      // suspended_until in messages/en.json is "Suspended until {date}" --
      // ActionDialogs.tsx only renders it once `hours` is truthy, and
      // recomputes it from Date.now() on every change to suspend_hours.
      await dialog.getByLabel('Duration (Hours)').fill('48');
      await expect(dialog.getByText('Minimum 1 hour')).toHaveCount(0);
      await expect(dialog.getByText(/Suspended until/)).toBeVisible();

      // ── Cancel instead of submitting -- Suspend has no undo in this app
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      await expect(row.getByRole('cell', { name: 'Active', exact: true })).toBeVisible();
    });
  });

  // Port of the Cypress "User Management: Bulk Lock Flow (Cloud Safe)" spec
  // (cypress/e2e/users/bulk-lock.cy.ts). That version mocked
  // `**/functions/v1/bulk-actions*` AND `**/rest/v1/rpc/*bulk*` as
  // alternatives ("if it's an RPC... Alternatively...") -- guessing at two
  // different possible backends rather than confirming either, and by its
  // own admission only asserted the UI reaching a "Processing"/"Pending"
  // label, not a real result.
  //
  // The real flow (BulkActionBar.tsx, useSubmitBulkAction ->
  // adapters/mutations/bulk.mutations.ts) is neither of those guesses: it's
  // a real RPC that enqueues a row for the `bulk-worker` Edge Function
  // (supabase/functions/bulk-worker/index.ts) to process asynchronously,
  // returning a job_id. That worker isn't part of this CI harness (e2e.yml
  // only starts the Postgres/Auth/Storage stack, not Edge Functions), so
  // there is no reliable, verifiable "done" state to assert here even if
  // the job were submitted -- unlike Lock/Unlock's synchronous RPC, this
  // would leave the test asserting its own optimistic UI state, not a real
  // result. Compounding that: a real bulk lock has no bulk-undo (only
  // per-row Unlock), and would touch every currently selected user at
  // once -- multiple real seeded fixtures, not the one disposable target
  // the single-user Lock/Unlock port uses. So, like Ban/Suspend, the first
  // test below drives real selection + the real confirm dialog, then
  // cancels instead of submitting. The second test goes one step further
  // and really submits -- safe only because it targets exactly one user
  // (Lina, seeded 'locked') for whom lock is idempotent; the
  // multi-fixture blast radius described above is what keeps the general
  // submit case out of E2E scope.
  test.describe('Bulk lock dialog & real submit (Cloud Safe)', () => {
    test('selects two users, opens the real bulk-lock confirm dialog with the live count, then cancels', async ({
      page,
    }) => {
      // ── Select two real data rows via their own checkboxes ──────────
      // UsersTable.tsx: each row's <input type="checkbox" checked={isSelected}
      // onChange={() => onSelectToggle(user.id)}> is independent of the
      // header "select all" checkbox tested implicitly by beforeEach above.
      // Rows 1 and 2 (row 0 is the header) are whichever two seeded users
      // sort first -- irrelevant here since this test only reads the
      // resulting count and cancels, never depending on which two.
      await page.getByRole('row').nth(1).getByRole('checkbox').check();
      await page.getByRole('row').nth(2).getByRole('checkbox').check();

      // ── The real selection bar (BulkActionBar.tsx) ──────────────────
      // "{count} selected" -- selectedCount is selectedIds.size from
      // UsersPage.tsx, so this also confirms both checkboxes actually
      // registered as two distinct selections, not one.
      //
      // Scoped to the "N selected" wrapper instead of a page-wide
      // getByText('2', { exact: true }) -- UserStatsCards.tsx renders its
      // own stat values (Locked/Suspended/Banned counts) as plain text
      // too, and one of those can independently equal the current
      // selection count, making an unscoped "2" ambiguous. The wrapper's
      // own text is "2 selected" ({selectedCount} in its own <div>,
      // {t('selected')} as a bare text node next to it), and "selected"
      // only renders on this page from BulkActionBar.tsx (the courses
      // page has its own copy in CourseBulkActionBar.tsx but that isn't
      // mounted here), so getByText('selected') already resolves to this
      // exact wrapper -- reusing it also lets us assert the live count.
      const selectionSummary = page.getByText('selected');
      await expect(selectionSummary).toBeVisible();
      await expect(selectionSummary).toContainText('2');

      // bulk_action_lock is "Lock" -- distinct from the row menu's "Lock
      // Account" and the dialog's own "Confirm Lock" button below, so this
      // is unambiguous without needing to scope to the action bar.
      await page.getByRole('button', { name: 'Lock', exact: true }).click();

      // ── The real confirm dialog ──────────────────────────────────────
      // bulk_confirm_title_lock is the static "Confirm Bulk Lock" (not
      // per-count, unlike Suspend's per-name title) -- bulk_confirm_desc
      // is where the live count actually appears: "This will affect
      // {count} user(s). This action cannot be easily undone."
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Confirm Bulk Lock')).toBeVisible();
      await expect(
        dialog.getByText('This will affect 2 user(s). This action cannot be easily undone.'),
      ).toBeVisible();

      // bulk_reason_label is "Reason (optional)" -- unlike Lock/Suspend/
      // Ban's per-user dialogs, there is no schema requiring this, so it's
      // fine (and realistic) to leave it empty and still be able to
      // proceed -- this test doesn't confirm either way, but leaving it
      // blank here also documents that Confirm isn't gated on it.
      await expect(dialog.getByLabel('Reason (optional)')).toBeVisible();

      // ── Cancel instead of submitting -- see the long comment above for
      // why this never confirms.
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();

      // Cancelling only closes the dialog (BulkActionBar.tsx's
      // handleCancel resets its own local pendingAction/reason state, not
      // the parent's selectedIds) -- the selection itself is untouched,
      // which is what lets an admin pick a different action after
      // cancelling instead of starting the selection over.
      await expect(page.getByText('2', { exact: true })).toBeVisible();

      // ── Clearing the selection is a separate, explicit action ────────
      // The bar's own "X" button (aria-label={tCommon('clear')} = "Clear")
      // is the actual way to deselect everything.
      await page.getByRole('button', { name: 'Clear' }).click();
      await expect(page.getByRole('row').nth(1).getByRole('checkbox')).not.toBeChecked();
      await expect(page.getByRole('row').nth(2).getByRole('checkbox')).not.toBeChecked();
    });

    // Port of the Cypress "User Management: Bulk Lock Flow (Cloud Safe)" spec
    // (cypress/e2e/users/bulk-lock.cy.ts), submit half. The selection +
    // confirm-dialog half is the test above; this one covers the real
    // submit -> job -> progress-panel path that the Cypress version faked
    // with cy.intercept on both a non-existent RPC and a guessed Edge
    // Function endpoint.
    test('submits a real bulk-lock job against an already-locked account (idempotent -- seed state unchanged)', async ({
      page,
    }) => {
      // ── Target: Lina Khalid ───────────────────────────────────────
      // supabase/schema/11_seed_reference.sql seeds Lina
      // (student2@eduzone-test.com) as 'locked', and no other spec in
      // this file touches her row: Lock/Unlock mutates Omar, Ban/Suspend
      // only open-then-cancel dialogs on Sara. Locking an already-locked
      // account is a no-op end-state-wise whether or not the CI
      // bulk-worker ever executes the job -- so unlike the multi-select
      // case in the comment above, this single-target submit needs no
      // restore step and cannot race with any other test (search box +
      // selection are per-page isolated state; only DB rows are shared).
      await page.getByPlaceholder('Search users...').fill('Lina');

      const row = page.getByRole('row', { name: /Lina Khalid/i });
      await expect(row).toBeVisible();
      await expect(row.getByRole('cell', { name: 'Locked', exact: true })).toBeVisible();

      await row.getByRole('checkbox').check();

      const selectionSummary = page.getByText('selected');
      await expect(selectionSummary).toBeVisible();
      await expect(selectionSummary).toContainText('1');

      await page.getByRole('button', { name: 'Lock', exact: true }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Confirm Bulk Lock')).toBeVisible();
      await expect(
        dialog.getByText('This will affect 1 user(s). This action cannot be easily undone.'),
      ).toBeVisible();

      // Timestamped reason: the route dedupes identical in-flight jobs
      // (uq_job_dedupe on job_type + payload_hash, 409 DUPLICATE_JOB),
      // so a CI retry re-submitting the byte-identical body while the
      // first job is still pending would be rejected. A unique reason
      // keeps each attempt submittable -- realistic too, reasons carry
      // incident references in practice.
      await dialog
        .getByLabel('Reason (optional)')
        .fill(`E2E idempotency probe ${Date.now()} on already-locked seed account`);

      // Deterministic submit sync: the real POST /api/bulk-action
      // (submitBulkAction, infrastructure/repos/bulk.service.ts ->
      // enqueueBulkJob -> admin_enqueue_bulk_job) must return 2xx.
      // This is the server-side result the Cypress mocks faked.
      const submitResponse = page.waitForResponse(
        (res) => res.url().includes('/api/bulk-action') && res.request().method() === 'POST',
      );
      await dialog.getByRole('button', { name: 'Confirm Lock' }).click();
      expect((await submitResponse).ok()).toBe(true);

      // ── Real submission artifacts ─────────────────────────────────
      // Panel first: persistent. BulkProgressPanel.tsx renders a "Bulk
      // lock" heading with the live status badge once onJobStarted
      // fires -- no worker timing involved.
      await expect(page.getByRole('heading', { name: 'Bulk lock' })).toBeVisible();
      // Toast second: transient (autoHideDuration 4000ms, Toast.tsx),
      // scoped with .filter({ hasText }) for the same __next-route-
      // announcer collision the lock/unlock test documents.
      await expect(
        page.getByRole('alert').filter({ hasText: 'Bulk operation started' }),
      ).toBeVisible();

      // ── Idempotency: seed state unchanged ─────────────────────────
      // Deliberately no terminal-status wait and no restore: the worker
      // may or may not run in this harness, and either way Lina stays
      // 'Locked'.
      await expect(row.getByRole('cell', { name: 'Locked', exact: true })).toBeVisible();
    });
  });

  // Port of the Cypress "Warning Flows" spec
  // (cypress/e2e/warnings/issue-warning.cy.ts). That version mocked the
  // user list, drove a "Security" tab that exists nowhere in src/, and
  // mocked the warning RPC twice -- including a fabricated
  // auto_suspended/suspension_until payload. The real
  // issue_warning/increment_warning_count RPCs (07_functions.sql) do no
  // auto-suspending at all: they insert the warning row and bump
  // warning_count. The real UI is the row menu's 'Issue Warning' item
  // -> IssueWarningDialog (ActionDialogs.tsx) -> issueWarningAction
  // Server Action (adapters/mutations/users.mutations.ts), so -- like
  // the single-user lock flow -- there is no browser-visible RPC to
  // intercept; the toast + dialog close are the verifiable result.
  test.describe('Issue warning (Cloud Safe -- counter-only side effect)', () => {
    // Target: Omar Abdullah (seeded 'active'). A warning touches only
    // warning_count/warnings rows -- never account_status -- so this
    // cannot race the Lock/Unlock test (asserts Active) or the
    // Ban/Suspend tests (Sara, dialogs-only). No restore needed and no
    // threshold side effects exist at any count (verified in SQL).
    async function openWarnDialog(page: Page, reason: string) {
      await page.getByPlaceholder('Search users...').fill('Omar');

      const row = page.getByRole('row', { name: /Omar Abdullah/i });
      await expect(row).toBeVisible();

      await row.getByRole('button', { name: 'User Options' }).click();
      await page.getByRole('menuitem', { name: 'Issue Warning' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText("Issue Warning to Omar Abdullah")).toBeVisible();
      await dialog.getByLabel('Reason').fill(reason);
      return { row, dialog };
    }

    test('rejects a short reason without submitting', async ({ page }) => {
      const { dialog } = await openWarnDialog(page, 'Too short');

      // issueWarningSchema: reason min 20 (domain/schemas/user.schema.ts)
      // -- 'Too short' (9 chars) fails client-side; the Server Action
      // never fires (the Cypress version's 'First strike'/'Third strike'
      // reasons would fail the same way).
      await dialog.getByRole('button', { name: 'Issue Warning', exact: true }).click();
      await expect(dialog.getByText('Reason must be at least 20 characters')).toBeVisible();

      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
    });

    test('issues a real warning and confirms no status side effect', async ({ page }) => {
      const { row, dialog } = await openWarnDialog(
        page,
        'Disruptive behavior flagged by automated E2E check',
      );

      // Severity/action stay at their defaults (Low / none) -- only the
      // reason is required.
      await dialog.getByRole('button', { name: 'Issue Warning', exact: true }).click();

      // warn_user_success is "Warning has been issued to {name}."
      // (messages/en.json) -- same alert scoping as the lock test.
      await expect(
        page.getByRole('alert').filter({ hasText: 'Warning has been issued to Omar Abdullah' }),
      ).toBeVisible();
      await expect(dialog).toBeHidden();

      // No status side effect: Omar is still Active (the warn path never
      // writes account_status -- verified in issue_warning SQL).
      await expect(row.getByRole('cell', { name: 'Active', exact: true })).toBeVisible();
    });
  });
});