import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'storybook-static/**',
      'test-results/**',
      'src/stories/**',
      '**/*.stories.*',
      'next-env.d.ts',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    // Test files legitimately need `any` for mock/spy casting (e.g.
    // `(fn as any).mockResolvedValue(...)`) — typing every mock precisely
    // adds boilerplate with no real safety benefit, since this code never
    // runs in production. Every other rule (including no-unused-vars) still
    // applies at full strictness to test files.
    files: ['**/*.test.{ts,tsx}', '**/*.test-d.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Cypress's documented pattern for extending Cypress.Chainable with
    // custom commands requires `declare global { namespace Cypress {...} }` —
    // there is no ES-module equivalent for this kind of ambient type merging.
    files: ['cypress/support/**/*.ts'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
    },
  },
];
