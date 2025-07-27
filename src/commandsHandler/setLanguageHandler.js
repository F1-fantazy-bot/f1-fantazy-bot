const { t, setLanguage, getSupportedLanguages, getLanguageName } = require('../i18n');
const { LANG_CALLBACK_TYPE } = require('../constants');
const azureStorageService = require('../azureStorageService');
const { sendMessageToUser } = require('../utils');

async function handleSetLanguage(bot, msg) {
  const chatId = msg.chat.id;
  const parts = msg.text.split(/\s+/);
  const lang = parts[1];

  if (!lang) {
    const keyboard = getSupportedLanguages().map((code) => [
      {
        text: getLanguageName(code, chatId),
        callback_data: `${LANG_CALLBACK_TYPE}:${code}`,
      },
    ]);

    await sendMessageToUser(bot, chatId, t('Please select a language:', chatId), {
      reply_to_message_id: msg.message_id,
      reply_markup: { inline_keyboard: keyboard },
    })
      .catch((err) => console.error('Error sending language menu:', err));

    return;
  }

  if (setLanguage(lang, chatId)) {
    await azureStorageService.saveUserSettings(bot, chatId, { lang });
    await sendMessageToUser(
      bot,
      chatId,
      t('Language changed to {LANG}.', chatId, { LANG: getLanguageName(lang, chatId) })
    )
      .catch((err) => console.error('Error sending language changed message:', err));
  } else {
    const langs = getSupportedLanguages().join(', ');
    await sendMessageToUser(
      bot,
      chatId,
      t('Invalid language. Supported languages: {LANGS}', chatId, { LANGS: langs })
    )
      .catch((err) => console.error('Error sending invalid language message:', err));
  }
}

module.exports = { handleSetLanguage };
