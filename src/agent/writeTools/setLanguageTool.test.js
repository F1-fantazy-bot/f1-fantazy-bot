jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
  WRITE_RESULT_STATUSES: {
    OK: 'ok',
    INVALID_INPUT: 'invalid_input',
  },
}));

jest.mock('../../services/setLanguageService', () => ({
  setLanguagePreference: jest.fn(),
  getFreshLanguagePreference: jest.fn(),
  isSupportedLanguage: jest.fn((lang) => lang === 'en' || lang === 'he'),
}));

const {
  setLanguagePreference,
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { userCache } = require('../../cache');
const { setLanguageTool } = require('./setLanguageTool');

beforeEach(() => {
  jest.clearAllMocks();
  getFreshLanguagePreference.mockResolvedValue({ lang: 'en' });
  for (const key of Object.keys(userCache)) {
    delete userCache[key];
  }
});

describe('setLanguageTool', () => {
  test('registers the concrete write tool through defineWriteTool', () => {
    expect(setLanguageTool).toMatchObject({
      name: 'set_language',
      description: expect.stringContaining('confirmation'),
    });
  });

  test('accepts configured language codes and rejects others with a standard envelope', async () => {
    await expect(
      setLanguageTool.validate({ chatId: 42, args: { lang: 'he' } }),
    ).resolves.toBeNull();
    await expect(
      setLanguageTool.validate({ chatId: 42, args: { lang: 'fr' } }),
    ).resolves.toEqual({
      status: 'invalid_input',
      tool: 'set_language',
      summary: 'Invalid language. Supported languages: en, he',
      supportedLanguages: ['en', 'he'],
    });
  });

  test('returns ok without staging when the requested language is already set', async () => {
    userCache['42'] = { lang: 'he' };
    getFreshLanguagePreference.mockResolvedValue({
      lang: 'he',
      fresh: true,
    });

    await expect(
      setLanguageTool.validate({ chatId: 42, args: { lang: 'he' } }),
    ).resolves.toMatchObject({
      status: 'ok',
      tool: 'set_language',
      lang: 'he',
      changed: false,
    });
  });

  test('refreshes before localizing invalid-language errors', async () => {
    userCache['42'] = { lang: 'he' };
    getFreshLanguagePreference.mockResolvedValue({
      lang: 'he',
      fresh: true,
    });

    await expect(
      setLanguageTool.validate({ chatId: 42, args: { lang: 'fr' } }),
    ).resolves.toMatchObject({
      status: 'invalid_input',
      summary: expect.stringContaining('שפה לא תקינה'),
    });
    expect(getFreshLanguagePreference).toHaveBeenCalledWith(42);
  });

  test('builds a human-readable confirmation summary', () => {
    expect(setLanguageTool.buildSummary({ args: { lang: 'he' } })).toContain(
      'Hebrew (he)',
    );
  });

  test('commits through the shared language service', async () => {
    setLanguagePreference.mockResolvedValue({
      status: 'ok',
      summary: 'Language changed.',
    });

    await expect(
      setLanguageTool.commit({ chatId: 42, args: { lang: 'he' } }),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(setLanguagePreference).toHaveBeenCalledWith({
      chatId: 42,
      lang: 'he',
    });
  });
});
