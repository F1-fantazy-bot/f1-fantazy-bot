const { t, setLanguage, getSupportedLanguages } = require('../i18n');
const { LANG_CALLBACK_TYPE } = require('../constants');

async function handleSetLanguage(bot, msg) {
  const chatId = msg.chat.id;
  const parts = msg.text.split(/\s+/);
  const lang = parts[1];

  if (!lang) {
    const keyboard = getSupportedLanguages().map((code) => [
      {
        text: t(code === 'en' ? 'English' : 'Hebrew', {}, chatId),
        callback_data: `${LANG_CALLBACK_TYPE}:${code}`,
      },
    ]);

    await bot
      .sendMessage(chatId, t('Please select a language:', {}, chatId), {
        reply_to_message_id: msg.message_id,
        reply_markup: { inline_keyboard: keyboard },
      })
      .catch((err) => console.error('Error sending language menu:', err));

    return;
  }

  if (setLanguage(lang, chatId)) {
    await bot
      .sendMessage(chatId, t('Language changed to {LANG}.', { LANG: lang }, chatId))
      .catch((err) => console.error('Error sending language changed message:', err));
  } else {
    const langs = getSupportedLanguages().join(', ');
    await bot
      .sendMessage(
        chatId,
        t('Invalid language. Supported languages: {LANGS}', { LANGS: langs }, chatId)
      )
      .catch((err) => console.error('Error sending invalid language message:', err));
  }
}

module.exports = { handleSetLanguage };
