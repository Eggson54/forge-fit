/**
 * Jest is configured to run the pure-TypeScript domain/logic tests
 * (discipline score, progressive overload, streaks, nutrition math, coach
 * message selection, etc.) without needing the native React Native runtime.
 * These modules contain the app's business logic and are fully unit-testable.
 */
module.exports = {
  preset: 'ts-jest/presets/default',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', esModuleInterop: true } }],
  },
};
