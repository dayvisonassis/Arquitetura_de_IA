/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  coverageDirectory: 'coverage',
  // babel/istanbul gera caminhos "file:/C:/..." no Windows e quebra o relatório lcov
  coverageProvider: 'v8',
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 80, statements: 80 },
  },
};
