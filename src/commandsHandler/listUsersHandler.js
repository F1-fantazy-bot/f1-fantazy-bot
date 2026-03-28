const { listAllUsers } = require('../userRegistryService');
const { sendErrorMessage, isAdminMessage, formatDateTime } = require('../utils/utils');
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

    const sortedUsers = sortUsersByLastSeenDesc(users);
    const message = formatUsersMessage(sortedUsers, chatId);

    await bot
      .sendMessage(chatId, message, { parse_mode: 'Markdown' })
      .catch((err) =>
        console.error('Error sending list users message:', err),
      );
  } catch (error) {
    console.error('Error in handleListUsersCommand:', error);
    await sendErrorMessage(bot, `Error listing users: ${error.message}`);

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

/**
 * Sort users by last seen time in descending order (most recent first).
 * Users with invalid/missing lastSeen are pushed to the end.
 * @param {Array} users - Array of user objects from listAllUsers
 * @returns {Array} Sorted users array
 */
function sortUsersByLastSeenDesc(users) {
  return [...users].sort((a, b) => {
    const lastSeenA = Date.parse(a.lastSeen);
    const lastSeenB = Date.parse(b.lastSeen);

    if (Number.isNaN(lastSeenA) && Number.isNaN(lastSeenB)) {
      return 0;
    }

    if (Number.isNaN(lastSeenA)) {
      return 1;
    }

    if (Number.isNaN(lastSeenB)) {
      return -1;
    }

    return lastSeenB - lastSeenA;
  });
}

module.exports = { handleListUsersCommand };
