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
  getLanguagePreference,
  getFreshLanguagePreference,
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

afterEach(() => {
  jest.restoreAllMocks();
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
});

describe('getLanguagePreference', () => {
  test('returns the currently saved in-memory language without writing', async () => {
    await setLanguagePreference({ chatId: 42, lang: 'he' });
    updateUserAttributes.mockClear();

    const result = getLanguagePreference(42);

    expect(result).toMatchObject({
      status: 'ok',
      lang: 'he',
      languageName: 'עברית',
    });
    expect(result.summary).toContain('עברית');
    expect(updateUserAttributes).not.toHaveBeenCalled();
  });
});

describe('getFreshLanguagePreference', () => {
  test('refreshes Azure before returning the account language', async () => {
    userCache['42'] = { lang: 'en' };
    getUserById.mockResolvedValue({ chatId: '42', lang: 'he' });

    await expect(getFreshLanguagePreference(42)).resolves.toMatchObject({
      status: 'ok',
      lang: 'he',
      languageName: 'עברית',
      fresh: true,
    });
  });

  test('falls back to initialized cache when the bounded refresh fails', async () => {
    userCache['42'] = { lang: 'he' };
    getUserById.mockRejectedValue(new Error('storage unavailable'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getFreshLanguagePreference(42);

    expect(result).toMatchObject({
      lang: 'he',
      fresh: false,
    });
    expect(result.summary).toContain('לא ניתן לאמת');
    expect(console.error).toHaveBeenCalledWith(
      'Error refreshing language preference:',
      expect.any(Error),
    );
  });
});

describe('setLanguagePreference errors', () => {
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
    ).rejects.toMatchObject({ name: 'AbortError' });
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

  test('post-write refresh does not reuse a profile read started before the write', async () => {
    let resolveOldLookup;
    let resolveNewLookup;
    getUserById
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOldLookup = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNewLookup = resolve;
        }),
      );

    const oldRefresh = refreshLanguagePreference(42);
    await setLanguagePreference({ chatId: 42, lang: 'he' });
    const newRefresh = refreshLanguagePreference(42);

    expect(getUserById).toHaveBeenCalledTimes(2);
    resolveNewLookup({ chatId: '42', lang: 'he' });
    await expect(newRefresh).resolves.toBe(true);

    resolveOldLookup({ chatId: '42', lang: 'en' });
    await expect(oldRefresh).resolves.toBe(false);
    expect(getLanguage(42)).toBe('he');
  });

  test('coalesces concurrent refreshes so callers cannot apply out of order', async () => {
    let resolveLookup;
    getUserById.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const first = refreshLanguagePreference(42);
    const second = refreshLanguagePreference(42);
    expect(getUserById).toHaveBeenCalledTimes(1);
    resolveLookup({ chatId: '42', lang: 'he' });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
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
