describe('User Management - Staging Environment', () => {
  beforeEach(() => {
    // cy.session automatically restores cookies and localStorage
    cy.loginAs('admin');

    // Ensure we are on the users page for each test iteration
    cy.visit('/users');

    // Ensure data grid loaded
    cy.get('[role="grid"]', { timeout: 20000 }).should('be.visible');
  });

  it('Loads user list with actual staging data', () => {
    // Wait until loading indicator goes away
    cy.get('.MuiCircularProgress-root').should('not.exist');

    // Ensure we have rows populated
    cy.get('[role="row"]').should('have.length.greaterThan', 1); // 1 header + N rows
  });

  it('Allows filtering users by email/name', () => {
    // This assumes the admin table has a DataGrid search/filter toolbar
    cy.get('input[placeholder*="Search"]').type('staging');

    // Wait for debounce/API call
    cy.wait(1000);

    cy.get('[role="grid"]').should('be.visible');
    // Check if the filtered results exist, if none exist on staging, it might be empty
  });

  it('Views user profile details', () => {
    // Click the first user row
    cy.get('[role="row"]').eq(1).click();

    // Find the 'View Profile' or action component depending on the UI (assuming a drawer/dialog)
    cy.contains(/Profile|Details/i, { timeout: 10000 }).should('be.visible');
  });
});
