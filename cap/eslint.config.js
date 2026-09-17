'use strict';

const js = require('@eslint/js');

/**
 * Flat ESLint configuration.
 *
 * CAP injects the CQL constructors (SELECT, INSERT, UPDATE, DELETE, UPSERT) and
 * `cds` as globals, so they are declared here instead of being required in
 * every file - that is the idiom the framework expects.
 */
const cdsGlobals = {
  cds: 'readonly',
  SELECT: 'readonly',
  INSERT: 'readonly',
  UPSERT: 'readonly',
  UPDATE: 'readonly',
  DELETE: 'readonly'
};

const nodeGlobals = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  process: 'readonly',
  console: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly'
};

const jestGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
  jest: 'readonly'
};

module.exports = [
  {
    ignores: ['node_modules/**', 'gen/**', 'coverage/**', 'app/**/webapp/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...nodeGlobals, ...cdsGlobals }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      curly: ['error', 'multi-line'],
      'object-shorthand': 'error',
      'no-return-await': 'error'
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { ...nodeGlobals, ...cdsGlobals, ...jestGlobals }
    },
    rules: {
      // Chai style assertions read as unused expressions.
      'no-unused-expressions': 'off'
    }
  }
];
