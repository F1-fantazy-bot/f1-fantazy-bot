const {
  CHIP_CALLBACK_TYPE,
  EXTRA_DRS_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
  WITHOUT_CHIP,
} = require('../constants');

async function handleChipsMessage(bot, msg) {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  // Reply with inline buttons
  await bot.sendMessage(chatId, 'which chip do you want to use?', {
    reply_to_message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Extra DRS',
            callback_data: `${CHIP_CALLBACK_TYPE}:${EXTRA_DRS_CHIP}`,
          },
          {
            text: 'Limitless',
            callback_data: `${CHIP_CALLBACK_TYPE}:${LIMITLESS_CHIP}`,
          },
          {
            text: 'Wildcard',
            callback_data: `${CHIP_CALLBACK_TYPE}:${WILDCARD_CHIP}`,
          },
          {
            text: 'Without Chip',
            callback_data: `${CHIP_CALLBACK_TYPE}:${WITHOUT_CHIP}`,
          },
        ],
      ],
    },
  });
}

module.exports = { handleChipsMessage };
