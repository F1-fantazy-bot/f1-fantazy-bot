const { getFlagForCountry } = require('./countryFlags');

describe('getFlagForCountry', () => {
  it('returns the flag for known countries (case-insensitive)', () => {
    expect(getFlagForCountry('Italy')).toBe('🇮🇹');
    expect(getFlagForCountry('italy')).toBe('🇮🇹');
    expect(getFlagForCountry('  JAPAN  ')).toBe('🇯🇵');
  });

  it('handles Ergast-style aliases', () => {
    expect(getFlagForCountry('UK')).toBe('🇬🇧');
    expect(getFlagForCountry('United Kingdom')).toBe('🇬🇧');
    expect(getFlagForCountry('USA')).toBe('🇺🇸');
    expect(getFlagForCountry('United States')).toBe('🇺🇸');
    expect(getFlagForCountry('UAE')).toBe('🇦🇪');
  });

  it('returns an empty string for unknown / invalid input', () => {
    expect(getFlagForCountry('Atlantis')).toBe('');
    expect(getFlagForCountry('')).toBe('');
    expect(getFlagForCountry(null)).toBe('');
    expect(getFlagForCountry(undefined)).toBe('');
    expect(getFlagForCountry(42)).toBe('');
  });
});
