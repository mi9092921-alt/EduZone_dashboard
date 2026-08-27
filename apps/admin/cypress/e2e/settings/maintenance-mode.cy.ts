describe('Maintenance Mode Flow (Cloud Safe)', () => {
  beforeEach(() => {
    cy.logout();
    cy.loginAs('super_admin');
  });

  it('Toggles Maintenance Mode via settings and intercepts config API', () => {
    // Intercept to force maintenance mode OFF initially
    cy.intercept('GET', '**/rest/v1/config*', (req) => {
      req.reply((res) => {
        if (!res.body) res.body = [{}];
        res.body[0] = { ...res.body[0], maintenance_mode: false };
      });
    }).as('getConfig');

    cy.visit('/settings');
    cy.wait('@getConfig');

    // Find the Maintenance Switch
    // Usually a switch has role="switch" inside a label containing "Maintenance"
    cy.contains('label', /Maintenance Mode/i)
      .parent()
      .find('button[role="switch"]')
      .as('maintSwitch');

    cy.get('@maintSwitch').should('have.attr', 'aria-checked', 'false');

    // Intercept the save mutation
    cy.intercept('PATCH', '**/rest/v1/config*', {
      statusCode: 200,
      body: [{ maintenance_mode: true }]
    }).as('patchConfig');

    // Click to Toggle
    cy.get('@maintSwitch').click();

    // Verify it saved
    cy.contains(/settings saved|maintenance updated/i, { timeout: 5000 }).should('be.visible');
    
    // Switch should reflect checked
    cy.get('@maintSwitch').should('have.attr', 'aria-checked', 'true');
  });
});
