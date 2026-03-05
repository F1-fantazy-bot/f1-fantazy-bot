const { listAllUsers } = require('../userRegistryService');
const { sendLogMessage, isAdminMessage, formatDateTime } = require('../utils/utils');
const { t, getLanguageName } = require('../i18n');

/**
 * Handle the /list_users admin command.
 * Fetches all registered users from Azure Table Storage and displays them.
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The Telegram message object
 */
async function handleListUsersCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  try {
    const users = await listAllUsers();

    if (users.length === 0) {
      await bot
        .sendMessage(chatId, t('No registered users found.', chatId))
        .catch((err) =>
          console.error('Error sending list users message:', err),
        );

      return;
    }

    const message = formatUsersMessage(users, chatId);

    await bot
      .sendMessage(chatId, message, { parse_mode: 'Markdown' })
      .catch((err) =>
        console.error('Error sending list users message:', err),
      );
  } catch (error) {
    console.error('Error in handleListUsersCommand:', error);
    await sendLogMessage(bot, `Error listing users: ${error.message}`);

    await bot
      .sendMessage(
        chatId,
        t('❌ Error fetching user list: {ERROR}', chatId, {
          ERROR: error.message,
        }),
      )
      .catch((err) =>
        console.error('Error sending list users error message:', err),
      );
  }
}

/**
 * Format the users list into a Telegram Markdown message.
 * @param {Array} users - Array of user objects from listAllUsers
 * @param {number} chatId - The chat ID for locale formatting
 * @returns {string} Formatted Markdown message
 */
function formatUsersMessage(users, chatId) {
  let message = `*${t('Registered Users', chatId)}* (${users.length})\n\n`;

  users.forEach((user, index) => {
    const firstSeenDate = new Date(user.firstSeen);
    const lastSeenDate = new Date(user.lastSeen);

    const firstSeenFormatted = formatDateTime(firstSeenDate, chatId);
    const lastSeenFormatted = formatDateTime(lastSeenDate, chatId);

    const langDisplay = getLanguageName(user.lang || 'en', chatId);

    message += `*${index + 1}. ${user.chatName}*\n`;
    message += `🆔 ${t('Chat ID', chatId)}: \`${user.chatId}\`\n`;
    if (user.nickname) {
      message += `📛 ${t('Nickname', chatId)}: ${user.nickname}\n`;
    }
    message += `🌐 ${t('Language', chatId)}: ${langDisplay}\n`;
    message += `📅 ${t('First Seen', chatId)}: ${firstSeenFormatted.dateStr}, ${firstSeenFormatted.timeStr}\n`;
    message += `🕐 ${t('Last Seen', chatId)}: ${lastSeenFormatted.dateStr}, ${lastSeenFormatted.timeStr}\n\n`;
  });

  return message;
}

module.exports = { handleListUsersCommand };
