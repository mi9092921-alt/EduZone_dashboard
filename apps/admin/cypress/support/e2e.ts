import './commands';

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Programmatically logs in as a specific role type using Supabase JS client.
       * Wait for the page dashboard to be visible to guarantee authentication logic loaded.
       */
      loginAs(role: 'super_admin' | 'admin' | 'teacher' | 'student'): Chainable<void>;
      /**
       * Clears local storage and redirects to the login route.
       */
      logout(): Chainable<void>;
    }
  }
}
