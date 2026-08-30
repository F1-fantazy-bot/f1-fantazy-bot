const { KILZI_CHAT_ID, DORSE_CHAT_ID } = require('./constants');

const ADMIN_CHAT_IDS = Object.freeze([
  KILZI_CHAT_ID,
  DORSE_CHAT_ID,
]);

function isAdminChatId(chatId) {
  return ADMIN_CHAT_IDS.includes(chatId);
}

module.exports = { ADMIN_CHAT_IDS, isAdminChatId };
