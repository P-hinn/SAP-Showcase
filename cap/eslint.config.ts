import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint configuration.
 *
 * The type aware rule set (`recommendedTypeChecked`) is the point of linting a
 * TypeScript project: it catches floating promises and unsafe `any` flowing
 * through the CAP query builder, which the compiler alone does not complain
 * about.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'gen/**',
      'coverage/**',
      // Generated from the CDS model by @cap-js/cds-typer.
      '@cds-models/**',
      // Fiori Elements apps: UI5 sources are linted by the UI5 tooling, not here.
      'app/**/webapp/**',
      // Shell, start page and tour: browser scripts in the same UI5 module format.
      'app/shared/**'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      curly: ['error', 'multi-line'],
      'object-shorthand': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',

      // CAP's query builder is typed loosely on purpose - a CQN result is not
      // knowable at compile time. Reading a row's fields is therefore an
      // `any` access by construction, and forbidding it would only produce
      // casts that lie. The rules that matter (floating promises, unused
      // variables, misused promises) stay on.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off'
    }
  },

  {
    files: ['test/**/*.ts'],
    rules: {
      // Chai style assertions read as unused expressions.
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  },

  {
    // Config files are not part of the service tsconfig.
    files: ['*.config.ts'],
    languageOptions: {
      parserOptions: { projectService: false }
    },
    ...tseslint.configs.disableTypeChecked
  }
);
