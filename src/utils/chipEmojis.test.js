const { getChipEmoji, DEFAULT_CHIP_EMOJI } = require('./chipEmojis');

describe('getChipEmoji', () => {
  it('maps Limitless regardless of case', () => {
    expect(getChipEmoji('Limitless')).toBe('🚀');
    expect(getChipEmoji('limitless')).toBe('🚀');
    expect(getChipEmoji('  LIMITLESS  ')).toBe('🚀');
  });

  it('maps Extra DRS Boost (the canonical name in the blob)', () => {
    expect(getChipEmoji('Extra DRS Boost')).toBe('⚡');
  });

  it('maps the shorter "Extra Boost" form as well', () => {
    expect(getChipEmoji('Extra Boost')).toBe('⚡');
  });

  it('maps Wildcard', () => {
    expect(getChipEmoji('Wildcard')).toBe('🃏');
  });

  it('falls back to the default emoji for unknown chips', () => {
    expect(getChipEmoji('Mystery Chip')).toBe(DEFAULT_CHIP_EMOJI);
  });

  it('returns the default emoji for empty / non-string input', () => {
    expect(getChipEmoji('')).toBe(DEFAULT_CHIP_EMOJI);
    expect(getChipEmoji(null)).toBe(DEFAULT_CHIP_EMOJI);
    expect(getChipEmoji(undefined)).toBe(DEFAULT_CHIP_EMOJI);
    expect(getChipEmoji(42)).toBe(DEFAULT_CHIP_EMOJI);
  });
});
