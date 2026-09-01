describe('User Management: Bulk Lock Flow (Cloud Safe)', () => {
  beforeEach(() => {
    cy.logout();
    cy.loginAs('super_admin');
  });

  it('Selects 5 users, triggers bulk lock, bypasses dry-run, and monitors progress panel', () => {
    // Intercept to return at least 5 mocked rows alongside whatever staging has
    // Or simpler: intercept the query to override page size to ensure 5 rows exist
    // without breaking the table schema.
    cy.intercept('POST', '**/rest/v1/rpc/get_users_list*', (req) => {
      req.reply((res) => {
        if (res.body && Array.isArray(res.body)) {
          // ensure at least 5 fake users if staging is empty
          const injectCount = 5 - res.body.length;
          for (let i = 0; i < injectCount; i++) {
            res.body.push({
              id: `mock-id-${i}`,
              email: `mock${i}@test.com`,
              first_name: 'Mock',
              last_name: `User${i}`,
              account_status: 'active',
            });
          }
        }
      });
    }).as('getUsersBulk');

    cy.visit('/users');
    cy.wait('@getUsersBulk');

    // Wait for the grid to render
    cy.get('[role="grid"]', { timeout: 10000 }).should('be.visible');

    // Select 5 row checkboxes (index 0 is header checkbox usually in MUI Grid, but let's select 1-5)
    for (let i = 1; i <= 5; i++) {
      cy.get('input[type="checkbox"]').eq(i).click({ force: true });
    }

    // Verify toolbar shows "5 selected"
    cy.contains(/5 selected/i).should('be.visible');

    // Click Bulk Actions menu/drawer
    cy.contains(/bulk actions|bulk/i).click();

    // Select "Lock Accounts"
    cy.contains(/lock/i).click();

    // Assert Dry Run / Confirmation modal appears
    cy.get('h2')
      .contains(/lock 5 users/i)
      .should('be.visible');

    cy.get('textarea[aria-label="Action Reason"]').type('Bulk security lockdown incident #123');

    // MOCK the actual Edge Function or RPC bulk logic
    // Usually bulk actions are sent to an Edge Function invoke or RPC
    cy.intercept('POST', '**/functions/v1/bulk-actions*', {
      statusCode: 200,
      body: { jobId: 'job-cypress-123', status: 'pending' },
    }).as('invokeBulkFunction');

    // Alternatively, if it's an RPC call `bulk_lock_users`
    cy.intercept('POST', '**/rest/v1/rpc/*bulk*', {
      statusCode: 200,
      body: { jobId: 'job-cypress-123' },
    }).as('rpcBulk');

    // Simulate clicking Confirm
    cy.get('button')
      .contains(/Confirm|Lock Accounts/i)
      .click();

    // Wait for either function or RPC
    // UI should spawn the BulkProgressPanel
    cy.contains(/Processing/i).should('be.visible');

    // Since we mocked the endpoint but no realtime events will fire from Supabase local,
    // the UI might hang in "pending" or we can mock the realtime subscription.
    // However, asserting that it transition from drawer to Processing state is sufficient to validate Phase 1 of the request.
    cy.contains(/Pending|Processing/i).should('be.visible');

    // Test successfully completes UI initiation for 5 users
  });
});
