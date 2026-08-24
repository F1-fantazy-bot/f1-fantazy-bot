jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
  WRITE_RESULT_STATUSES: {
    INVALID_INPUT: 'invalid_input',
  },
}));

jest.mock('../../services/setLanguageService', () => ({
  setLanguagePreference: jest.fn(),
  isSupportedLanguage: jest.fn((lang) => lang === 'en' || lang === 'he'),
}));

const {
  setLanguagePreference,
} = require('../../services/setLanguageService');
const { setLanguageTool } = require('./setLanguageTool');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('setLanguageTool', () => {
  test('registers the concrete write tool through defineWriteTool', () => {
    expect(setLanguageTool).toMatchObject({
      name: 'set_language',
      description: expect.stringContaining('confirmation'),
    });
  });

  test('accepts configured language codes and rejects others with a standard envelope', () => {
    expect(setLanguageTool.validate({ args: { lang: 'he' } })).toBeNull();
    expect(setLanguageTool.validate({ args: { lang: 'fr' } })).toEqual({
      status: 'invalid_input',
      tool: 'set_language',
      summary: 'Invalid language. Supported languages: en, he',
      supportedLanguages: ['en', 'he'],
    });
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
