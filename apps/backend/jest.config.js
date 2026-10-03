module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/__tests__/setupTests.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '<rootDir>/__tests__/setupTests.js',
    '<rootDir>/__tests__/utils/'
  ],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 }
  }
}
