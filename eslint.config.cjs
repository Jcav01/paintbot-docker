// Flat ESLint configuration (ESLint v9+)
// Applies to all JavaScript in the monorepo services.
const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  // Global settings for all JS files
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
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
  // Discord service uses CommonJS modules (except tests)
  {
    files: ['discord/**/*.js', '!discord/tests/**'],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  // Discord tests use ES modules
  {
    files: ['discord/tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  // Database, Twitch, YouTube tests use ES modules (explicit for clarity)
  {
    files: ['database/tests/**/*.js', 'twitch/tests/**/*.js', 'youtube/tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
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
