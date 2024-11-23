import type { Config } from 'jest';

/**
 * ts-jest compiles the sources on the fly, which means the test run type
 * checks them as well - `npm test` fails on a type error, not just on a
 * failing assertion.
 *
 * `setupFiles` runs test/setup.ts before anything else, which is what makes
 * CAP pick up the TypeScript service implementation at all - see the comment
 * in that file. Getting this wrong does not fail loudly: the service starts
 * without any custom handlers and every action answers 501.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  collectCoverageFrom: ['srv/**/*.ts'],
  // The rule modules are the part of this project that must not regress
  // silently, so they carry a hard coverage floor.
  coverageThreshold: {
    './srv/lib/': {
      statements: 95,
      branches: 90,
      functions: 100,
      lines: 95
    }
  },
  // Jest's own crawler is fast enough for this repository, and a broken
  // watchman install on a developer machine should not fail the test run.
  watchman: false,
  testTimeout: 30000
};

export default config;
