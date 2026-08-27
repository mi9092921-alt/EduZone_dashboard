describe('Audit Verification Flow (Cloud Safe)', () => {
  beforeEach(() => {
    cy.logout();
    cy.loginAs('super_admin');
  });

  it('Performs real GET on Staging chain state and validates Intact UI', () => {
    // 1. Visit Audit
    // We let the real API return the chain state. It's safe to read.
    cy.visit('/audit');

    // Assure the Staging server responded
    cy.get('h1').contains(/Audit|Logs/i, { timeout: 10000 }).should('be.visible');
    
    // Check that we see a chain state summary like "Last Sequence:"
    cy.contains(/Last Sequence|Sequence/i).should('exist');

    // MOCK the actual verification process so we don't have to download thousands of logs
    // which could crash the Cypress test tab memory. We mock an INTACT chain.
    cy.intercept('POST', '**/rest/v1/rpc/get_activity_logs_for_verification*', {
      statusCode: 200,
      body: [
        { seq: 1, prev_hash: 'GENESIS', entry_hash: 'h1', activity_type: 'login', created_at: new Date().toISOString() },
        { seq: 2, prev_hash: 'h1', entry_hash: 'h2', activity_type: 'course_view', created_at: new Date().toISOString() },
      ]
    }).as('getLogsForVerify');

    cy.contains('button', /Verify Chain|Verify/i).click();

    cy.wait('@getLogsForVerify');

    // The frontend hash verifier should correctly validate and show intact
    cy.contains(/Chain Intact/i, { timeout: 10000 }).should('be.visible');
  });

  it('Displays Tampered Alert when mocked tampered logs map fails crypto validation', () => {
    cy.visit('/audit');

    cy.intercept('POST', '**/rest/v1/rpc/get_activity_logs_for_verification*', {
      statusCode: 200,
      body: [
        { seq: 1, prev_hash: 'GENESIS', entry_hash: 'h1', activity_type: 'login', created_at: new Date().toISOString() },
        { seq: 2, prev_hash: 'WRONG_HASH', entry_hash: 'h2', activity_type: 'course_view', created_at: new Date().toISOString() },
      ]
    }).as('getLogsTampered');

    cy.contains('button', /Verify Chain|Verify/i).click();

    cy.wait('@getLogsTampered');

    // Should indicate the sequence number where the tamper happened
    cy.contains(/Tamper Detected|Tampered/i, { timeout: 10000 }).should('be.visible');
    cy.contains(/sequence 2/i).should('be.visible');
  });
});
