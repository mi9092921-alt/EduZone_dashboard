import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

// Flat ESLint config for @eduzone/ui. Mirrors the base block of
// apps/admin/eslint.config.mjs — same parser, same @typescript-eslint
// recommended set, same import/order contract (minus the app-specific
// architecture blocks, which only exist inside the app). This package is
// consumed by apps/admin, so its code must satisfy the same lint gate:
// review item 04 removed the "No lint configured yet" echo that let
// violations in packages/* ship through the CI Lint step unnoticed.
export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        // No .tsx in this package today, but it owns the shared theme /
        // tokens consumed by React components — keep JSX parseable so
        // adding components later cannot silently bypass the gate.
        ecmaFeatures: { jsx: true },
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
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
];
