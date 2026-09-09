import { test, expect, type Page } from '@playwright/test';

// Port of the Cypress "Course Creation Flow" spec
// (cypress/e2e/courses/create-course.cy.ts). That version cannot have been
// passing as written:
//  - It fakes auth by writing a hand-made session object to localStorage
//    under 'sb-auth-token'. Real auth here is Supabase SSR over httpOnly
//    cookies (infrastructure/supabase/*) -- a localStorage stub never
//    authenticates a Server Action or an RLS-scoped query.
//  - It intercepts 'POST **/rest/v1/rpc/get_courses*' and
//    'POST **/rest/v1/rpc/get_users*'. Neither RPC exists in src/ or in
//    supabase/schema/: the list is a plain GET on the courses table with
//    ilike filters (infrastructure/repos/courses.service.ts getCourses).
//  - It intercepts 'POST **/rest/v1/rpc/create_course' and asserts a
//    redirect to '/courses/new-course-id'. The real create path is a
//    browser-client insert (courses.service.ts createCourse, RLS-enforced),
//    and on success the dialog simply closes with a toast -- there is no
//    redirect anywhere in CreateCourseDialog.tsx.
//  - Its validation test expects the literal text 'Required'. The real
//    schema (domain/schemas/course.schema.ts) reports
//    'Title must be at least 3 characters'.
//
// This port drives the real dialog against the real seeded backend:
// a validation test that never submits, and a create-then-delete test
// that restores seed state in the same run.
test.describe('Course Creation', () => {
  // Uses global auth state by default (admin@eduzone-test.com).

  test.beforeEach(async ({ page }) => {
    await page.goto('/courses');
    // Same skeleton-row trap documented in users.spec.ts: CoursesTable.tsx
    // renders animate-pulse <tr> placeholders while isLoading, with no
    // form controls inside. A real data row carries an
    // <input type="checkbox">, so waiting for row 1's checkbox proves
    // real data (the seed always provides courses).
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('row').nth(1).getByRole('checkbox')).toBeVisible();
  });

  test('shows validation errors for an empty title without submitting', async ({ page }) => {
    // The page-level opener and the dialog footer submit share the
    // accessible name 'Create Course' (common.create_course), so the
    // submit click below is scoped to the dialog.
    await page.getByRole('button', { name: 'Create Course', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Create New Course')).toBeVisible();

    await dialog.getByRole('button', { name: 'Create Course', exact: true }).click();

    // createCourseSchema: title min(3). Nothing is submitted -- the
    // mutation never fires on client-side validation failure.
    await expect(dialog.getByText('Title must be at least 3 characters')).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('creates a course with a unique title, then deletes it to restore seed state', async ({
    page,
  }) => {
    // ── Unique target ─────────────────────────────────────────────
    // Timestamped title: isolates this test under fullyParallel (no
    // other spec creates courses), defeats slug/unique collisions on CI
    // retries (each attempt gets its own title), and makes the row
    // locatable by an exact substring no seed data contains.
    const title = `E2E Course ${Date.now()}`;

    await page.getByRole('button', { name: 'Create Course', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Create New Course')).toBeVisible();

    await dialog.getByLabel('Course Title').fill(title);
    await dialog.getByLabel('Description').fill('Created by the automated E2E port check.');
    await dialog.getByLabel('Category').fill('E2E');

    // Deterministic submit sync: the real insert is a browser-client
    // POST to PostgREST (courses.service.ts createCourse, enforced by
    // the courses_insert_merged RLS policy for admins). This is the
    // server-side result the Cypress version mocked.
    const insertResponse = page.waitForResponse(
      (res) => res.url().includes('/rest/v1/courses') && res.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Create Course', exact: true }).click();
    expect((await insertResponse).ok()).toBe(true);

    // ── Real creation artifacts ───────────────────────────────────
    // Toast first: transient (autoHideDuration 4000ms, Toast.tsx),
    // scoped with .filter({ hasText }) for the __next-route-announcer
    // collision documented in users.spec.ts.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Course created successfully' }),
    ).toBeVisible();

    // The new course sorts first (getCourses orders created_at desc),
    // but locate it by title, not position.
    const row = page.getByRole('row', { name: title });
    await expect(row).toBeVisible();

    // ── Restore: delete the course we just created ────────────────
    // The actions cell stops propagation (CoursesTable.tsx), so the
    // row menu opens instead of navigating to the detail page. The
    // MoreVert trigger is the row's only button; the menu itself is a
    // real MUI Menu (role="menu"/"menuitem" via Dropdown.tsx).
    await row.getByRole('button').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    // DeleteCourseDialog.tsx: title 'Delete Course', single-click
    // confirm labelled 'Delete' (same text as the menu item that opened
    // it -- scoping to the dialog, now that the menu is closed, keeps
    // this unambiguous). No type-to-confirm gate exists.
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog.getByText('Delete Course')).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();

    // delete_success_msg is `Course "{title}" has been deleted
    // successfully.` -- match the stable tail, not the quoted title.
    await expect(
      page.getByRole('alert').filter({ hasText: 'has been deleted successfully' }),
    ).toBeVisible();

    // Seed state restored: the row is gone.
    await expect(page.getByRole('row', { name: title })).toHaveCount(0);
  });

  // Port of the Cypress "Course Management: Enroll Student Flow" spec
  // (cypress/e2e/courses/enroll-student.cy.ts). That version mocked the
  // course list, the student lookup, AND both the table-insert and the
  // RPC enroll endpoints as alternatives -- then asserted a success
  // banner its own mocks never rendered.
  //
  // Tracing the REAL flow required correcting two wrong turns:
  //  - The rendered detail page is TeacherCourseDetailPage (the
  //    [id]/page.tsx route mounts it), NOT features/courses'
  //    CourseDetailPage. Its tabs are Students(=default) / Curriculum /
  //    Analytics / Course Details -- there is no Enrollments tab to
  //    click. (CourseDetailPage + CourseEnrollmentsTab, with the only
  //    UI revoke button in the codebase, are unmounted dead code: no
  //    route or importer references them. Worth a cleanup ticket --
  //    and it means no reachable UI can revoke an enrollment.)
  //  - The reachable enroll UI is StudentProgressPage (Students tab):
  //    'Enroll Student' button -> the same EnrollStudentDialog (MUI
  //    Autocomplete over the real student list) -> enroll_student RPC.
  //    Its rows carry no actions, so restore happens by deleting the
  //    course created inside the test (soft-delete hides it and its
  //    enrollments from every UI query).
  test.describe('Student enrollment (Cloud Safe -- self-restoring)', () => {
    async function gotoCourseDetail(page: Page, title: string) {
      // Courses list -> detail. The title cell carries no interactive
      // children (thumbnail img has alt=""), so clicking it follows the
      // row's onViewCourse navigation instead of hitting a nested
      // control -- same reasoning as users.spec.ts's User-cell click.
      await page.goto('/courses');
      await expect(page.getByRole('table')).toBeVisible();
      await expect(page.getByRole('row').nth(1).getByRole('checkbox')).toBeVisible();
      const courseRow = page.getByRole('row', { name: title });
      await expect(courseRow).toBeVisible();
      await courseRow.getByRole('cell').nth(1).click();

      // Detail confirms by its own heading. The Students tab (with the
      // enroll action) is the default -- no tab clicking involved.
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Enroll Student', exact: true })).toBeVisible();
    }

    test('rejects an empty enrollment without submitting', async ({ page }) => {
      // Zero-mutation: a seeded course, dialog opened then cancelled.
      await gotoCourseDetail(page, 'Database Design Principles');

      // Opener and dialog submit share 'Enroll Student'
      // (common.btn_enroll_student) -- submit is dialog-scoped below.
      await page.getByRole('button', { name: 'Enroll Student', exact: true }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Enroll Student')).toBeVisible();

      await dialog.getByRole('button', { name: 'Enroll Student', exact: true }).click();

      // enrollStudentSchema: user_id uuid('Select a student'). The
      // mutation never fires on client-side validation failure.
      await expect(dialog.getByText('Select a student')).toBeVisible();

      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
    });

    test('enrolls Lina in a freshly created course, then deletes the course to restore seed state', async ({
      page,
    }) => {
      // ── Unique course: isolates parallel runs and CI retries ────
      // Timestamped title (same pattern as the create-course test):
      // no other spec creates courses, and each attempt gets its own
      // row + slug. Lina (seeded 'locked', untouched by any other
      // spec) is the student; enroll_student is additionally an
      // UPSERT (ON CONFLICT reactivates, 07_functions.sql), so even a
      // retry landing on a leftover converges instead of 409/duplicate
      // failing.
      const title = `E2E Enroll Target ${Date.now()}`;

      await page.goto('/courses');
      await expect(page.getByRole('table')).toBeVisible();
      await expect(page.getByRole('row').nth(1).getByRole('checkbox')).toBeVisible();

      await page.getByRole('button', { name: 'Create Course', exact: true }).click();
      const createDialog = page.getByRole('dialog');
      await expect(createDialog.getByText('Create New Course')).toBeVisible();
      await createDialog.getByLabel('Course Title').fill(title);
      const createResponse = page.waitForResponse(
        (res) => res.url().includes('/rest/v1/courses') && res.request().method() === 'POST',
      );
      await createDialog.getByRole('button', { name: 'Create Course', exact: true }).click();
      expect((await createResponse).ok()).toBe(true);
      await expect(
        page.getByRole('alert').filter({ hasText: 'Course created successfully' }),
      ).toBeVisible();

      // ── Enroll Lina via the real Students-tab dialog ────────────
      await gotoCourseDetail(page, title);
      await page.getByRole('button', { name: 'Enroll Student', exact: true }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Enroll Student')).toBeVisible();

      // MUI Autocomplete over the REAL student list (useUsers query,
      // primary_role=student). Typing filters server-side; the option
      // label is "Name (email)" (getOptionLabel in
      // EnrollStudentDialog.tsx). Auto-retry covers the round trip.
      await dialog.getByLabel('Select Student').click();
      await dialog.getByLabel('Select Student').fill('Lina');
      await page.getByRole('option', { name: /Lina Khalid/i }).click();

      // Deterministic submit sync: the real enroll_student RPC
      // (courses.service.ts enrollStudent, browser client, admin holds
      // courses.manage in seed role_permissions).
      const enrollResponse = page.waitForResponse(
        (res) => res.url().includes('/rest/v1/rpc/enroll_student') && res.request().method() === 'POST',
      );
      await dialog.getByRole('button', { name: 'Enroll Student', exact: true }).click();
      expect((await enrollResponse).ok()).toBe(true);
      await expect(dialog).toBeHidden();

      // The dialog toasts nothing on success (EnrollStudentDialog.tsx
      // just closes) -- the new progress row is the real result. The
      // Students tab shows progress rows (status chip 'In Progress',
      // email masked) rather than enrollment rows.
      const row = page.getByRole('row', { name: /Lina Khalid/i });
      await expect(row).toBeVisible();
      await expect(row.getByText('In Progress')).toBeVisible();

      // ── Restore: delete the course created above ────────────────
      // Soft-delete (deleteCourse use case) hides the course and, with
      // it, this enrollment from every UI query. Same proven steps as
      // the create-course test.
      await page.goto('/courses');
      await expect(page.getByRole('table')).toBeVisible();
      await expect(page.getByRole('row').nth(1).getByRole('checkbox')).toBeVisible();
      const createdRow = page.getByRole('row', { name: title });
      await expect(createdRow).toBeVisible();
      await createdRow.getByRole('button').click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();

      const deleteDialog = page.getByRole('dialog');
      await expect(deleteDialog.getByText('Delete Course')).toBeVisible();
      await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(
        page.getByRole('alert').filter({ hasText: 'has been deleted successfully' }),
      ).toBeVisible();
      await expect(page.getByRole('row', { name: title })).toHaveCount(0);
    });
  });
});
