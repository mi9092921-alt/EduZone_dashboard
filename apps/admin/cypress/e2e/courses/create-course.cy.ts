describe('Course Creation Flow', () => {
  beforeEach(() => {
    // Mock successful login state
    const session = {
      access_token: 'fake-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'fake-refresh-token',
      user: {
        id: 'user-123',
        email: 'admin@eduzone.com',
      },
    };
    
    // Set mock session in localStorage (simulating being logged in)
    window.localStorage.setItem('sb-auth-token', JSON.stringify(session));

    // Intercept initial data fetches
    cy.intercept('POST', '**/rest/v1/rpc/get_courses*', {
      statusCode: 200,
      body: { data: [], count: 0 },
    }).as('getCourses');

    cy.intercept('POST', '**/rest/v1/rpc/get_users*', {
      statusCode: 200,
      body: {
        data: [
          { id: 't1', email: 'teacher@eduzone.com', first_name: 'Sarah', last_name: 'Drasner', primary_role: 'teacher' },
        ],
        count: 1,
      },
    }).as('getTeachers');

    cy.visit('/en/courses');
    cy.wait('@getCourses');
  });

  it('should create a new course successfully', () => {
    cy.contains('button', /Create Course/i).click();
    
    // Check if modal is open
    cy.contains('h2', /Create New Course/i).should('be.visible');

    // Fill the form
    cy.get('#title').type('Cypress Automated Course');
    cy.get('#description').type('This course was created by an automated test.');
    cy.get('#category').type('Automation');

    // Intercept creation RPC
    cy.intercept('POST', '**/rest/v1/rpc/create_course', {
      statusCode: 200,
      body: { id: 'new-course-id', title: 'Cypress Automated Course' },
    }).as('createCourse');

    // Click submit
    cy.get('button[type="submit"]').click();

    cy.wait('@createCourse');

    // Verify redirection (Next.js router)
    cy.url().should('include', '/courses/new-course-id');
  });

  it('should show validation errors for empty title', () => {
    cy.contains('button', /Create Course/i).click();
    
    // Click submit without filling required title
    cy.get('button[type="submit"]').click();

    cy.contains('Required').should('be.visible');
  });
});
