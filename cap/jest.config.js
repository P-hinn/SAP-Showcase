'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: ['srv/**/*.js'],
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
  testTimeout: 30000
};
