const { getLocale, setLanguage, languageCache } = require('./i18n');

describe('getLocale', () => {
  const chatId = 67890;
  afterEach(() => {
    Object.keys(languageCache).forEach((key) => delete languageCache[key]);
  });

  it('returns English locale by default', () => {
    expect(getLocale(chatId)).toBe('en-GB');
  });

  it('returns Hebrew locale when language set to he', () => {
    setLanguage('he', chatId);
    expect(getLocale(chatId)).toBe('he-IL');
  });
});
