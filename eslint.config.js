// Flat config (ESLint 9). See https://eslint.org/docs/latest/use/configure/configuration-files
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '.planning/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Browser-side standalone demo scripts loaded via <script> tags in
    // docs/demo/*.html. No bundler, no module system — globals (window,
    // document, React, the MOCK_* fixtures) are passed via window.* and
    // the script load order in index.html.
    files: ['docs/demo/**/*.js', 'docs/demo/**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        React: 'readonly',
        ReactDOM: 'readonly',
      },
    },
    rules: {
      // The demo uses sibling-file React component globals (e.g. ReadoutView
      // defined in screens-readout.jsx, referenced in app.jsx). Don't flag
      // those as no-undef — the script-tag order in index.html guarantees
      // they're present at runtime.
      'no-undef': 'off',
    },
  },
];
