/* Root ESLint configuration for all services */
module.exports = {
  root: true,
  env: {
    node: true,
    es2023: true,
  },
  settings: {},
  plugins: [],
  extends: [
    "eslint:recommended",
    // Put prettier last to disable formatting rules that might conflict
    "prettier",
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  // Global rules (keep minimal; formatting handled by Prettier)
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-constant-condition": ["warn", { checkLoops: false }],
  },
  overrides: [
    {
      files: ["discord/**/*.js"],
      // Discord service still uses CommonJS
      parserOptions: {
        sourceType: "script",
      },
      env: {
        commonjs: true,
      },
    },
    {
      files: ["**/scripts/**/*.js"],
      rules: {
        "no-console": "off",
      },
    },
  ],
};
