describe('Token Version Validation Flow (Staging)', () => {
  before(() => {
    // Standard login to Staging
    cy.loginAs('super_admin');
  });

  after(() => {
    cy.logout();
  });

  it('Forces standard logout when token_version mismatch is detected in check_user_access', () => {
    // Visit a protected page
    cy.visit('/users');
    cy.get('[data-cy="page-header"]').should('contain.text', 'Users');

    // Setup an intercept to mock a token_version mismatch error from the database check
    cy.intercept('POST', '**/rest/v1/rpc/check_user_access', {
      statusCode: 200,
      body: { 
        status: 'version_mismatch',
        error: 'Token version expired'
      }
    }).as('checkAccessMismatch');

    // Trigger a refresh or navigation that calls check_user_access
    // Usually navigating or polling triggers it
    cy.visit('/users/admins');

    cy.wait('@checkAccessMismatch');

    // The middleware or client guard should forcibly sign out via supabase.auth.signOut() 
    // and route to login with reason
    cy.url({ timeout: 10000 }).should('include', 'reason=session_invalidated');
    
    // Assert the invalidation toast appears
    cy.contains(/Session Invalidated|Logged out/i).should('be.visible');
  });
});
