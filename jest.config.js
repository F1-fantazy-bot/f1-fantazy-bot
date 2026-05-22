module.exports = {
  // Specify that tests run in a Node environment
  testEnvironment: 'node',

  // The web/ project has its own test runner (Vitest). Skip its
  // tests during the root-level Jest pass so a TypeScript file
  // doesn't cause a parser failure.
  testPathIgnorePatterns: ['/node_modules/', '/web/'],

  // Enable code coverage collection
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.js', // Collect coverage from all JavaScript files in the src directory
    '!src/bot.js', // Exclude the entry point bot file
    '!src/**/index.js', // Exclude index files
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 76,
      branches: 61,
      lines: 76,
      functions: 67,
    },
  },
};
