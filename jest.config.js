module.exports = {
  // Specify that tests run in a Node environment
  testEnvironment: 'node',

  // Enable code coverage collection
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.js', // Collect coverage from all JavaScript files in the src directory
    '!src/bot.js', // Exclude the entry point bot file
  ],
  coverageDirectory: 'coverage',

  // Optionally enforce a minimum coverage threshold
  // todo: kilzi: set coverage threshold
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 6,
      lines: 14,
      statements: 13,
    },
  },
};
