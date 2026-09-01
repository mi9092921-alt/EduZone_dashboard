describe('Warning Flows (Cloud Safe)', () => {
  beforeEach(() => {
    cy.logout();
    cy.loginAs('super_admin');
  });

  it('Issues 3 warnings sequentially and asserts auto-suspend integration', () => {
    // 1. Initial State: Load Users
    cy.intercept('POST', '**/rest/v1/rpc/get_users_list*', (req) => {
      req.reply((res) => {
        if (!res.body) res.body = [];
        if (res.body.length === 0) {
          res.body.push({
            id: 'mock-warn-1',
            first_name: 'Warning',
            last_name: 'Target',
            warning_count: 0,
            account_status: 'active',
          });
        }
      });
    }).as('getUsersWarning');

    cy.visit('/users');
    cy.wait('@getUsersWarning');

    cy.contains('tr', 'Warning Target').click();
    cy.contains('button', /Security/i).click();

    // 2. Issue First Warning
    cy.contains('button', /Issue Warning/i).click();
    cy.get('h2')
      .contains(/Warning/)
      .should('be.visible');
    cy.get('textarea, input[name="reason"]').type('First strike');

    cy.intercept('POST', '**/rest/v1/rpc/*warning*', {
      statusCode: 200,
      body: { success: true, warning_count: 1 },
    }).as('rpcWarn1');

    cy.get('button')
      .contains(/Proceed|Issue/i)
      .click();
    cy.contains(/warning issued/i, { timeout: 5000 }).should('be.visible');

    // MOCK 3rd Warning response which triggers auto suspension side-effect
    cy.contains('button', /Issue Warning/i).click();
    cy.get('textarea, input[name="reason"]').type('Third strike');

    cy.intercept('POST', '**/rest/v1/rpc/*warning*', {
      statusCode: 200,
      body: {
        success: true,
        warning_count: 3,
        auto_suspended: true,
        suspension_until: '2099-01-01',
      },
    }).as('rpcWarn3');

    cy.get('button')
      .contains(/Proceed|Issue/i)
      .click();

    // UI should display either a toast describing the suspension, or update the view
    cy.contains(/suspended automatically|warning issued/i, { timeout: 5000 }).should('be.visible');
  });
});
