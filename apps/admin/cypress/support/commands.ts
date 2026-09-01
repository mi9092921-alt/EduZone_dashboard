import { createClient } from '@supabase/supabase-js';

// ── App-specific Types for Cypress ──────────────────────────────
export type AppRole = 'super_admin' | 'admin' | 'teacher' | 'student';

// ── Commands Implementation ──────────────────────────────────────
Cypress.Commands.add('loginAs', (role: AppRole) => {
  cy.session(
    role,
    () => {
      cy.log(`Logging in as: ${role}`);

      const email = Cypress.env(`${role}_email`);
      const password = Cypress.env(`${role}_password`);

      if (!email || !password) {
        throw new Error(
          `Missing Cypress env variables for role: ${role}. Ensure ${role}_email and ${role}_password are set in cypress.env.json or CI.`,
        );
      }

      const supabaseUrl = Cypress.env('supabase_url');
      const supabaseKey = Cypress.env('supabase_anon_key');

      if (!supabaseUrl || !supabaseKey) {
        throw new Error(
          'Missing Supabase config. Set supabase_url and supabase_anon_key in Cypress env.',
        );
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      cy.wrap(supabase.auth.signInWithPassword({ email, password }), { log: false }).then(
        (res: unknown) => {
          const { data, error } = res as Awaited<
            ReturnType<typeof supabase.auth.signInWithPassword>
          >;
          if (error) throw error;

          const sessionKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
          window.localStorage.setItem(sessionKey, JSON.stringify(data.session));
        },
      );
    },
    {
      cacheAcrossSpecs: true,
      validate: () => {
        // Validation callback to ensure the token remains valid
        const supabaseUrl = Cypress.env('supabase_url');
        const sessionKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
        const sessionItem = window.localStorage.getItem(sessionKey);
        if (!sessionItem) throw new Error('Session not found in localStorage');
      },
    },
  );

  // Visit the home page to ensure context loads with the now set localStorage
  cy.visit('/');
});

Cypress.Commands.add('logout', () => {
  cy.window().then((win) => win.localStorage.clear());
  cy.visit('/login');
});
