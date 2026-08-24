jest.mock('../userRegistryService', () => ({
  updateUserAttributes: jest.fn(),
  getUserById: jest.fn(),
}));

const {
  updateUserAttributes,
  getUserById,
} = require('../userRegistryService');
const { userCache } = require('../cache');
const { getLanguage } = require('../i18n');
const {
  setLanguagePreference,
  refreshLanguagePreference,
  isSupportedLanguage,
  resetLanguageGenerationsForTests,
} = require('./setLanguageService');

beforeEach(() => {
  jest.clearAllMocks();
  resetLanguageGenerationsForTests();
  updateUserAttributes.mockResolvedValue(undefined);
  getUserById.mockResolvedValue(null);
  for (const key of Object.keys(userCache)) {
    delete userCache[key];
  }
});

describe('setLanguagePreference', () => {
  test('persists and applies a supported language', async () => {
    const result = await setLanguagePreference({ chatId: 42, lang: 'he' });

    expect(updateUserAttributes).toHaveBeenCalledWith(42, { lang: 'he' });
    expect(getLanguage(42)).toBe('he');
    expect(result).toMatchObject({
      status: 'ok',
      lang: 'he',
      languageName: expect.any(String),
    });
  });

  test('returns invalid_input without persistence or cache mutation', async () => {
    const result = await setLanguagePreference({ chatId: 42, lang: 'fr' });

    expect(result).toEqual({
      status: 'invalid_input',
      summary: 'Invalid language. Supported languages: en, he',
      lang: 'fr',
      supportedLanguages: ['en', 'he'],
    });
    expect(updateUserAttributes).not.toHaveBeenCalled();
    expect(getLanguage(42)).toBe('en');
  });

  test('does not mutate local cache when durable persistence fails', async () => {
    updateUserAttributes.mockRejectedValue(new Error('table unavailable'));

    await expect(
      setLanguagePreference({ chatId: 42, lang: 'he' }),
    ).rejects.toThrow('table unavailable');
    expect(getLanguage(42)).toBe('en');
  });
});

describe('refreshLanguagePreference', () => {
  test('hydrates the language written by another process', async () => {
    getUserById.mockResolvedValue({ chatId: '42', lang: 'he' });

    await expect(refreshLanguagePreference(42)).resolves.toBe(true);
    expect(getUserById).toHaveBeenCalledWith(42, {
      abortSignal: expect.any(AbortSignal),
    });
    expect(getLanguage(42)).toBe('he');
  });

  test('ignores missing or invalid persisted language', async () => {
    getUserById.mockResolvedValue({ chatId: '42', lang: 'fr' });

    await expect(refreshLanguagePreference(42)).resolves.toBe(false);
    expect(getLanguage(42)).toBe('en');
  });

  test('aborts a slow registry lookup after the configured bound', async () => {
    getUserById.mockImplementation(
      (_chatId, { abortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    await expect(
      refreshLanguagePreference(42, { timeoutMs: 5 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getLanguage(42)).toBe('en');
  });

  test('returns at the deadline even when table initialization ignores abort', async () => {
    getUserById.mockReturnValue(new Promise(() => {}));

    await expect(
      refreshLanguagePreference(42, { timeoutMs: 5 }),
    ).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Language refresh timed out',
    });
    expect(getLanguage(42)).toBe('en');
  });

  test('does not let a stale refresh overwrite a newer local write', async () => {
    let resolveLookup;
    getUserById.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const staleRefresh = refreshLanguagePreference(42);
    await setLanguagePreference({ chatId: 42, lang: 'he' });
    resolveLookup({ chatId: '42', lang: 'en' });

    await expect(staleRefresh).resolves.toBe(false);
    expect(getLanguage(42)).toBe('he');
  });

  test('only the newest concurrent refresh may update local language', async () => {
    let resolveFirst;
    let resolveSecond;
    getUserById
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );

    const first = refreshLanguagePreference(42);
    const second = refreshLanguagePreference(42);
    resolveSecond({ chatId: '42', lang: 'he' });
    await expect(second).resolves.toBe(true);
    resolveFirst({ chatId: '42', lang: 'en' });
    await expect(first).resolves.toBe(false);

    expect(getLanguage(42)).toBe('he');
  });
});

describe('isSupportedLanguage', () => {
  test('accepts only configured language codes', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('he')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
  });
});
