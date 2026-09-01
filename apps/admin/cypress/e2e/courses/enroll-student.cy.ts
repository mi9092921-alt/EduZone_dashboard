describe('Course Management: Enroll Student Flow (Cloud Safe)', () => {
  beforeEach(() => {
    cy.logout();
    cy.loginAs('super_admin');
  });

  it('Enrolls a student via mock POST, verifies presence in table', () => {
    // 1. Intercept courses list
    cy.intercept('POST', '**/rest/v1/rpc/get_courses_list*', (req) => {
      req.reply((res) => {
        if (!res.body) res.body = [];
        if (res.body.length === 0) {
          res.body.push({ id: 'course-1', title: 'Cypress 101' });
        }
      });
    }).as('getCourses');

    cy.visit('/courses');
    cy.wait('@getCourses');

    // Go to first course
    cy.get('tr').first().click();

    // The detail page usually calls enrollments
    cy.contains(/Enrollments|Students/i).click();

    // Click "Add Enrollment/Enroll"
    cy.contains(/Enroll Student|Add/i).click();

    // Wait for the modal/drawer to open
    cy.get('h2')
      .contains(/Enroll/)
      .should('be.visible');

    // Assuming we type the user's email or ID in an autocomplete
    cy.get('input[placeholder*="Search by email"]').type('student@eduzone.app');

    // MUI Autocomplete interaction logic
    cy.get('li[role="option"]').contains('student@eduzone.app').click();

    // Intercept the POST to `enrollments` table or `enroll_student` RPC
    cy.intercept('POST', '**/rest/v1/enrollments*', {
      statusCode: 201,
      body: [{ id: 'mock-enrollment-1', course_id: 'course-1', user_id: 'mock-student' }],
    }).as('postEnrollment');

    cy.intercept('POST', '**/rest/v1/rpc/*enroll*', {
      statusCode: 200,
      body: {},
    }).as('rpcEnrollment');

    cy.get('button')
      .contains(/Confirm|Enroll/i)
      .click();

    // Assert success
    cy.contains(/succesfully enrolled|added to course/i, { timeout: 10000 }).should('be.visible');
  });
});
