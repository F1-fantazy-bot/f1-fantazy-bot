const { t, setLanguage, getSupportedLanguages } = require('../i18n');
const { COMMAND_SET_LANGUAGE } = require('../constants');

async function handleSetLanguage(bot, msg) {
  const chatId = msg.chat.id;
  const parts = msg.text.split(/\s+/);
  const lang = parts[1];

  if (!lang) {
    await bot
      .sendMessage(chatId, t('Usage: {CMD} <LANG>', { CMD: COMMAND_SET_LANGUAGE }))
      .catch((err) => console.error('Error sending usage message:', err));

    return;
  }

  if (setLanguage(lang)) {
    await bot
      .sendMessage(chatId, t('Language changed to {LANG}.', { LANG: lang }))
      .catch((err) => console.error('Error sending language changed message:', err));
  } else {
    const langs = getSupportedLanguages().join(', ');
    await bot
      .sendMessage(
        chatId,
        t('Invalid language. Supported languages: {LANGS}', { LANGS: langs })
      )
      .catch((err) => console.error('Error sending invalid language message:', err));
  }
}

module.exports = { handleSetLanguage };
