const {
  CHIP_CALLBACK_TYPE,
  EXTRA_DRS_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
  WITHOUT_CHIP,
} = require('../constants');
const { t } = require('../i18n');
const { sendMessageToUser } = require('../utils');

async function handleChipsMessage(bot, msg) {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // Reply with inline buttons
  await sendMessageToUser(bot, chatId, t('which chip do you want to use?', chatId), {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: t('Extra DRS', chatId),
            callback_data: `${CHIP_CALLBACK_TYPE}:${EXTRA_DRS_CHIP}`,
          },
          {
            text: t('Limitless', chatId),
            callback_data: `${CHIP_CALLBACK_TYPE}:${LIMITLESS_CHIP}`,
          },
          {
            text: t('Wildcard', chatId),
            callback_data: `${CHIP_CALLBACK_TYPE}:${WILDCARD_CHIP}`,
          },
          {
            text: t('Without Chip', chatId),
            callback_data: `${CHIP_CALLBACK_TYPE}:${WITHOUT_CHIP}`,
          },
        ],
      ],
    },
  });
}

module.exports = { handleChipsMessage };
