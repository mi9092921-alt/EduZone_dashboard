describe('Authentication Flow (Staging)', () => {
  beforeEach(() => {
    // Clear state before each test
    cy.logout();
  });

  it('Redirects unauthenticated users to /login', () => {
    cy.visit('/users');
    cy.url().should('include', '/login');
  });

  it('Allows an admin to sign in and redirects to dashboard', () => {
    const email = Cypress.env('admin_email');
    const password = Cypress.env('admin_password');

    cy.visit('/login');
    
    // Fill out LoginForm
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password);
    
    // Submit
    cy.get('button[type="submit"]').click();
    
    // Wait for the redirect using the generic UI elements
    cy.url({ timeout: 15000 }).should('eq', Cypress.config().baseUrl + '/');
    cy.get('[data-cy="page-header"]', { timeout: 15_000 }).should('be.visible').and('contain.text', 'Dashboard');
  });

  it('Shows error for invalid credentials', () => {
    cy.visit('/login');
    
    // Use intercept to Mock a wrong credentials response so we don't spam Staging limits
    cy.intercept('POST', '**/auth/v1/token?grant_type=password', {
      statusCode: 400,
      body: { error: 'invalid_grant', error_description: 'Invalid login credentials' }
    }).as('loginRequest');

    cy.get('input[name="email"]').type('invalid@eduzone.app');
    cy.get('input[name="password"]').type('wrongpassword123');
    cy.get('button[type="submit"]').click();

    cy.wait('@loginRequest');
    
    // Verify error toast/alert from the Supabase auth response
    cy.contains(/invalid login credentials/i, { timeout: 10000 }).should('be.visible');
    cy.url().should('include', '/login');
  });

  it('Shows Session Invalidated warning banner if redirected via check_user_access', () => {
    cy.visit('/login?reason=session_invalidated');
    // Verify an alert box or toast appears specifying the session was invalidated
    cy.contains(/Session Invalidated|Logged out automatically/i, { timeout: 5000 }).should('be.visible');
  });

  it('Prompts for MFA if required and intercepts verification', () => {
    cy.visit('/login');
    // Mock the initial token response to require MFA (AAL2)
    cy.intercept('POST', '**/auth/v1/token?grant_type=password', {
      statusCode: 200,
      body: { 
        access_token: 'mock-aal1-token',
        user: { id: 'mock', email: 'admin@eduzone.app' },
        amr: [{ method: 'password', timestamp: Date.now() / 1000 }]
        // normally supabase returns weak token, client prompts MFA.
      }
    }).as('loginMfaRequest');

    cy.get('input[name="email"]').type('mfa_required@eduzone.app');
    cy.get('input[name="password"]').type('password123');
    cy.get('button[type="submit"]').click();

    // In a real flow, if AAL2 is enforced but current is AAL1, client redirects to /login/mfa
    // We simply assert the UI has transitioned to the MFA factor step if implemented.
    cy.get('input[name="code"], input[name="totp"]', { timeout: 10000 }).should('exist');
  });
});
