// Shared effectful language-preference service.
//
// Both Telegram adapters and the web-agent write tool call this module so
// validation, Azure persistence, and local cache mutation stay aligned.

const {
  t,
  setLanguage,
  getLanguage,
  getSupportedLanguages,
  getLanguageName,
} = require('../i18n');
const {
  updateUserAttributes,
  getUserById,
} = require('../userRegistryService');

const STATUS = Object.freeze({
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
});

const LANGUAGE_REFRESH_TIMEOUT_MS = 750;
const languageGenerations = new Map();
const inFlightLanguageRefreshes = new Map();

function generationFor(chatId) {
  return languageGenerations.get(String(chatId)) || 0;
}

function advanceGeneration(chatId) {
  const key = String(chatId);
  const next = generationFor(chatId) + 1;
  languageGenerations.set(key, next);

  return next;
}

function isSupportedLanguage(lang) {
  return (
    typeof lang === 'string' &&
    getSupportedLanguages().includes(lang)
  );
}

function invalidResult(chatId, lang) {
  const supportedLanguages = getSupportedLanguages();

  return {
    status: STATUS.INVALID_INPUT,
    summary: t(
      'Invalid language. Supported languages: {LANGS}',
      chatId,
      { LANGS: supportedLanguages.join(', ') },
    ),
    lang,
    supportedLanguages,
  };
}

function getLanguagePreference(chatId) {
  const lang = getLanguage(chatId);
  const languageName = getLanguageName(lang, chatId);

  return {
    status: STATUS.OK,
    summary: t('Your saved language is {LANG} ({CODE}).', chatId, {
      LANG: languageName,
      CODE: lang,
    }),
    lang,
    languageName,
  };
}

async function getFreshLanguagePreference(chatId) {
  let fresh = false;
  try {
    fresh = await refreshLanguagePreference(chatId);
  } catch (err) {
    // Agent reads should remain available during a transient UserRegistry
    // timeout; use the process cache populated by ensureCacheReady().
    console.error('Error refreshing language preference:', err);
  }

  const preference = getLanguagePreference(chatId);
  if (fresh) {
    return { ...preference, fresh: true };
  }

  return {
    ...preference,
    fresh: false,
    summary: t(
      'Your cached language is {LANG} ({CODE}); the saved setting could not be verified right now.',
      chatId,
      {
        LANG: preference.languageName,
        CODE: preference.lang,
      },
    ),
  };
}

async function setLanguagePreference({ chatId, lang }) {
  if (!isSupportedLanguage(lang)) {
    return invalidResult(chatId, lang);
  }

  // Persist first. If Azure is unavailable, do not report success or mutate
  // only this process while every other Function worker stays unchanged.
  await updateUserAttributes(chatId, { lang });
  // Invalidate refreshes that started before this durable write. Without the
  // generation guard, a slow old-value read could overwrite the new local
  // cache after this function returns.
  advanceGeneration(chatId);
  if (!setLanguage(lang, chatId)) {
    throw new Error(`Failed to apply supported language "${lang}"`);
  }

  const languageName = getLanguageName(lang);

  return {
    status: STATUS.OK,
    summary: t('Language changed to {LANG}.', chatId, {
      LANG: getLanguageName(lang, chatId),
    }),
    lang,
    languageName,
  };
}

// Telegram and the agent run in separate Function processes. Refresh the
// persisted language before Telegram routes an allowed message so a change
// made through the web agent is visible without waiting for a host restart.
async function refreshLanguagePreference(
  chatId,
  { timeoutMs = LANGUAGE_REFRESH_TIMEOUT_MS } = {},
) {
  const key = String(chatId);
  const existing = inFlightLanguageRefreshes.get(key);
  if (existing) {
    return await existing;
  }

  // Coalesce all concurrent readers for one user onto the same durable
  // lookup. A local write can still invalidate the cache application through
  // the generation token.
  const refreshPromise = (async () => {
    const refreshGeneration = advanceGeneration(chatId);
    const controller = new AbortController();
    let timeout;
    try {
      const lookup = getUserById(chatId, {
        abortSignal: controller.signal,
      });
      const deadline = new Promise((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const err = new Error('Language refresh timed out');
          err.name = 'AbortError';
          reject(err);
        }, timeoutMs);
      });
      // The outer race bounds the whole operation, including ensureTable() /
      // createTable(), which runs before the SDK receives abortSignal for the
      // point lookup.
      const user = await Promise.race([lookup, deadline]);
      if (!user || !isSupportedLanguage(user.lang)) {
        return false;
      }
      if (generationFor(chatId) !== refreshGeneration) {
        return false;
      }

      return setLanguage(user.lang, chatId);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  })();

  inFlightLanguageRefreshes.set(key, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    if (inFlightLanguageRefreshes.get(key) === refreshPromise) {
      inFlightLanguageRefreshes.delete(key);
    }
  }
}

function resetLanguageGenerationsForTests() {
  languageGenerations.clear();
  inFlightLanguageRefreshes.clear();
}

module.exports = {
  setLanguagePreference,
  getLanguagePreference,
  getFreshLanguagePreference,
  refreshLanguagePreference,
  isSupportedLanguage,
  STATUS,
  LANGUAGE_REFRESH_TIMEOUT_MS,
  resetLanguageGenerationsForTests,
};
