const { translations, LANGUAGE_NAME_KEYS } = require('./translations');
const { userCache } = require('./cache');
const defaultLanguage = process.env.BOT_LANGUAGE || 'en';

function setLanguage(lang, chatId) {
  if (!translations[lang] || chatId === undefined) {
    return false;
  }

  if (!userCache[chatId]) {
    userCache[chatId] = {};
  }

  userCache[chatId].lang = lang;

  return true;
}

function getLanguage(chatId) {
  if (chatId !== undefined) {
    return (userCache[chatId] && userCache[chatId].lang) || defaultLanguage;
  }

  return defaultLanguage;
}


function getSupportedLanguages() {
  return Object.keys(translations);
}

function t(message, chatId, params = {}) {
  const lang = chatId !== undefined ? getLanguage(chatId) : defaultLanguage;

  let text = (translations[lang] && translations[lang][message]) || message;
  for (const [key, value] of Object.entries(params)) {
    text = text.replace(new RegExp(`{${key}}`, 'g'), value);
  }

  return text;
}

function getLanguageName(code, chatId) {
  const key = LANGUAGE_NAME_KEYS[code] || code;

  return t(key, chatId);
}

function getLocale(chatId) {
  const lang = getLanguage(chatId);

  switch (lang) {
    case 'he':
      return 'he-IL';
    default:
      return 'en-GB';
  }
}

module.exports = {
  t,
  setLanguage,
  getLanguage,
  getSupportedLanguages,
  getLanguageName,
  getLocale,
};
