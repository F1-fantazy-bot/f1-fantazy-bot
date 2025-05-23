module.exports = {
  // Specify that tests run in a Node environment
  testEnvironment: 'node',

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
