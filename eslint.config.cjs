// Flat ESLint configuration (ESLint v9+)
// Applies to all JavaScript in the monorepo services.
const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  // Discord service uses CommonJS modules (except tests)
  {
    files: ['discord/**/*.js', '!discord/tests/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'commonjs',
      },
      globals: {
        ...globals.node, // Node.js globals: console, process, Buffer, setTimeout, etc.
        fetch: 'readonly', // Node 18+ global fetch
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-condition': ['warn', { checkLoops: false }],
    },
  },
  // Global settings for all other JS files (default to ESM)
  {
    files: [
      'database/**/*.js',
      'twitch/**/*.js',
      'youtube/**/*.js',
      'discord/tests/**/*.js',
      '!**/node_modules/**',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node, // Node.js globals: console, process, Buffer, setTimeout, etc.
        fetch: 'readonly', // Node 18+ global fetch
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-condition': ['warn', { checkLoops: false }],
    },
  },
  // Allow console in scripts & operational code
  {
    files: ['**/scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },
  // Disable stylistic rules that Prettier handles
  prettier,
];
