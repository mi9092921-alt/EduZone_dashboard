describe('Global App Lock Flow (Cloud Safe)', () => {
  beforeEach(() => {
    cy.logout();
    cy.loginAs('super_admin');
  });

  it('Locks the application via Settings and intercepts lock_app RPC', () => {
    // Navigate to settings which displays App Lock Controls
    cy.visit('/settings');

    // The Lock App button
    cy.contains('button', /Lock App/i).click();

    // The generic Confimation dialog for Locking the App requires a message
    cy.get('textarea, input[name="message"]').type('Cypress Automated Lockdown');

    cy.intercept('POST', '**/rest/v1/rpc/lock_app', {
      statusCode: 200,
      body: true,
    }).as('rpcLockApp');

    cy.get('button').contains(/Proceed|Lock/i).click();

    cy.wait('@rpcLockApp').its('request.body').should('have.property', '_message');
    
    cy.contains(/App locked successfully/i, { timeout: 5000 }).should('be.visible');
  });

  it('Displays Global Lock Screen if check_user_access returns app_locked', () => {
    cy.intercept('POST', '**/rest/v1/rpc/check_user_access', {
      statusCode: 200,
      body: { status: 'app_locked', error: 'Cypress Lockdown active' }
    }).as('checkAccessLocked');

    cy.visit('/dashboard');
    cy.wait('@checkAccessLocked');

    // Assert the Global App Lock screen covers the dashboard
    cy.contains(/Application Locked/i, { timeout: 5000 }).should('be.visible');
    cy.contains(/Cypress Lockdown active/i).should('be.visible');
  });
});
