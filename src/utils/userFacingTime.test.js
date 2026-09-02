const {
  USER_TIME_ZONE,
  formatUserLocalDateTime,
} = require('./userFacingTime');

describe('userFacingTime', () => {
  test('formats a valid timestamp in the user-facing Jerusalem timezone', () => {
    expect(USER_TIME_ZONE).toBe('Asia/Jerusalem');
    expect(formatUserLocalDateTime('2026-08-22T05:41:00.000Z', 'en')).toContain(
      '08:41',
    );
    expect(formatUserLocalDateTime('2026-08-22T05:41:00.000Z', 'he')).toContain(
      '8:41',
    );
  });

  test('does not turn invalid values into a user-visible date', () => {
    expect(formatUserLocalDateTime('not-a-date', 'en')).toBeNull();
    expect(formatUserLocalDateTime(null, 'he')).toBeNull();
  });
});
