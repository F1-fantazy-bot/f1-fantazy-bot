const {
  CHIP_CALLBACK_TYPE,
  EXTRA_DRS_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
  WITHOUT_CHIP,
} = require('../constants');
const { t } = require('../i18n');

async function handleChipsMessage(bot, msg) {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // Reply with inline buttons
  await bot.sendMessage(chatId, t('which chip do you want to use?'), {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t('Extra DRS'),
            callback_data: `${CHIP_CALLBACK_TYPE}:${EXTRA_DRS_CHIP}`,
          },
          {
            text: t('Limitless'),
            callback_data: `${CHIP_CALLBACK_TYPE}:${LIMITLESS_CHIP}`,
          },
          {
            text: t('Wildcard'),
            callback_data: `${CHIP_CALLBACK_TYPE}:${WILDCARD_CHIP}`,
          },
          {
            text: t('Without Chip'),
            callback_data: `${CHIP_CALLBACK_TYPE}:${WITHOUT_CHIP}`,
          },
        ],
      ],
    },
  });
}

module.exports = { handleChipsMessage };
