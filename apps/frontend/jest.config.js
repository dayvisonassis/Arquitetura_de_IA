module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/src/setup-jest.ts'],
  testMatch: ['**/+(*.)+(spec).+(ts)'],
  testEnvironment: 'jsdom',
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    '!src/app/**/*.module.ts',
    '!src/app/**/*.interface.ts',
    '!src/app/**/*.model.ts',
    '!src/app/**/*.enum.ts',
    '!src/app/**/*.routes.ts',
    '!src/app/**/*-routing.ts'
  ],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 }
  },
  moduleNameMapper: {
    '^app/(.*)$': '<rootDir>/src/app/$1',
    '^environments/(.*)$': '<rootDir>/src/environments/$1'
  },
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/src/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.html$'
      }
    ]
  }
}
