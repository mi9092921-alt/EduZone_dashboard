describe('Notifications Flow', () => {
  beforeEach(() => {
    // Mock successful login state
    const session = {
      access_token: 'fake-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'fake-refresh-token',
      user: {
        id: 'admin-123',
        email: 'admin@eduzone.com',
        user_metadata: { role: 'super_admin' }
      },
    };
    window.localStorage.setItem('sb-auth-token', JSON.stringify(session));

    // Mock notifications list
    cy.intercept('GET', '**/rest/v1/notifications*', {
      statusCode: 200,
      body: [
        {
          id: 'n1',
          title: 'System Alert',
          body: 'Hello World',
          target_audience: 'all',
          created_at: new Date().toISOString(),
        }
      ],
      headers: { 'Content-Range': '0-0/1' }
    }).as('getNotifications');

    // Mock permissions list
    cy.intercept('GET', '**/rest/v1/permissions*', {
      statusCode: 200,
      body: [{ name: 'users.manage' }, { name: 'courses.manage' }]
    }).as('getPermissions');

    cy.visit('/en/notifications');
    cy.wait('@getNotifications');
  });

  it('should send a notification to all students', () => {
    cy.contains('button', /Send New Notification/i).click();

    cy.get('input[name="title"]').type('Hello Students');
    cy.get('textarea[name="body"]').type('This is a test notification for all students.');

    // Audience selection (MUI Select)
    cy.get('[role="combobox"]').contains(/students/i).parent().click();
    cy.get('[role="listbox"]').contains(/Students/i).click();

    cy.intercept('POST', '**/rest/v1/rpc/send_notification', {
      statusCode: 200,
      body: 'new-id'
    }).as('sendNotification');

    cy.get('button').contains(/Send Notification/i).click();

    cy.wait('@sendNotification').its('request.body').should('deep.include', {
      p_title: 'Hello Students',
      p_target_audience: 'students'
    });

    cy.contains(/Success/i).should('be.visible');
  });

  it('should send a notification to users with specific permission', () => {
    cy.contains('button', /Send New Notification/i).click();

    // Change targeting type to Permission
    cy.get('[role="group"]').contains(/Permission/i).click();

    cy.get('input[name="title"]').type('For Managers');
    cy.get('textarea[name="body"]').type('You have special access.');

    // Permission select
    cy.contains('label', /Target Permission/i).parent().find('[role="combobox"]').click();
    cy.get('[role="listbox"]').contains(/users.manage/i).click();

    cy.intercept('POST', '**/rest/v1/rpc/send_notification', {
      statusCode: 200,
      body: 'new-id'
    }).as('sendNotification');

    cy.get('button').contains(/Send Notification/i).click();

    cy.wait('@sendNotification').its('request.body').should('deep.include', {
      p_target_permission: 'users.manage'
    });
  });

  it('should delete a notification', () => {
    // Click delete icon in the first row
    cy.get('tr').first().find('button[aria-label*="delete"]').click();

    cy.contains(/Are you sure/i).should('be.visible');

    cy.intercept('POST', '**/rest/v1/rpc/delete_notification', {
      statusCode: 200,
      body: null
    }).as('deleteNotification');

    cy.get('button').contains(/Delete Notification/i).click();

    cy.wait('@deleteNotification');
    cy.contains(/deleted successfully/i).should('be.visible');
  });
});
