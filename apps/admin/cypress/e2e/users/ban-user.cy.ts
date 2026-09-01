describe('User Management: Ban User Flow (Cloud Safe)', () => {
  beforeEach(() => {
    cy.loginAs('super_admin');
  });

  it('Requires BAN confirmation text and executes permanent Ban via mock', () => {
    cy.intercept('POST', '**/rest/v1/rpc/get_users_list*', (req) => {
      req.reply((res) => {
        if (res.body && res.body.length > 0) {
          res.body[0].account_status = 'active';
          res.body[0].first_name = 'Cypress';
          res.body[0].last_name = 'TestBan';
        }
      });
    }).as('getUsersBan');

    cy.visit('/users');
    cy.wait('@getUsersBan');

    cy.contains('tr', 'Cypress TestBan').click();
    cy.contains('button', /Security/i).click();
    cy.contains('button', /Ban Permanently/i).click();

    cy.get('h2')
      .contains(/Ban User/i)
      .should('be.visible');
    cy.get('textarea[aria-label="Action Reason"]').type('Permanent violation E2E');

    // Check for hard prompt
    cy.get('input[placeholder*="BAN"]').type('BAN');

    cy.intercept('POST', '**/rest/v1/rpc/*ban*', { statusCode: 200, body: {} }).as('rpcBan');
    cy.intercept('PATCH', '**/rest/v1/users*', { statusCode: 200, body: [{}] }).as('patchBan');

    cy.get('button')
      .contains(/Ban Permanently/i)
      .click();

    cy.contains(/banned successfully/i, { timeout: 5000 }).should('be.visible');
  });
});
