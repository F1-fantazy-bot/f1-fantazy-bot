const { getLocale, setLanguage } = require('./i18n');
const { userCache } = require('./cache');

describe('getLocale', () => {
  const chatId = 67890;
  afterEach(() => {
    Object.keys(userCache).forEach((key) => delete userCache[key]);
  });

  it('returns English locale by default', () => {
    expect(getLocale(chatId)).toBe('en-GB');
  });

  it('returns Hebrew locale when language set to he', () => {
    setLanguage('he', chatId);
    expect(getLocale(chatId)).toBe('he-IL');
  });
});
