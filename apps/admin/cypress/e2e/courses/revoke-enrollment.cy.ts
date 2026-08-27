describe('Course Management: Revoke Enrollment Flow (Cloud Safe)', () => {
  beforeEach(() => {
    cy.logout();
    cy.loginAs('super_admin');
  });

  it('Revokes an existing enrollment via mocked PATCH', () => {
    // Force inject an enrollment row if empty staging
    cy.intercept('POST', '**/rest/v1/rpc/get_enrollments*', (req) => {
      req.reply((res) => {
        if (!res.body) res.body = [];
        if (res.body.length === 0) {
          res.body.push({ 
            id: 'mock-enroll-123', 
            user: { first_name: 'John', last_name: 'Doe', email: 'johndoe@eduzone.app' },
            status: 'active'
          });
        }
      });
    }).as('getEnrollments');

    // Direct visit to a generic course detail ID
    cy.visit('/courses/123-uuid');
    
    cy.contains(/Enrollments|Students/i).click();
    cy.wait('@getEnrollments');

    // Click on More Vert button for 'John Doe'
    cy.contains('tr', 'John Doe').find('button[aria-label="More actions"]').click();

    // Click the highly destructive action
    cy.contains('li', /Revoke|Drop/i).click();

    // Wait for the modal/drawer to open
    cy.get('h2').contains(/Revoke|Remove/).should('be.visible');

    // Provide a reason if required
    cy.get('textarea, input[name="reason"]').type('Cypress Automated testing');

    // Intercept the PATCH to soft-delete
    cy.intercept('PATCH', '**/rest/v1/enrollments*', {
      statusCode: 200,
      body: [{ id: 'mock-enroll-123', status: 'revoked' }]
    }).as('patchRevoke');

    // Submit
    cy.get('button').contains(/Revoke|Proceed/i).click();

    // Ensure the dialog closed and we have a success toast
    cy.contains(/revoked successfully|dropped/i, { timeout: 5000 }).should('be.visible');
  });
});
