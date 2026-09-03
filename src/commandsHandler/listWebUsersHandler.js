const { listAllowedUsers } = require('../webUserAllowlistService');
const { listAllUsers } = require('../userRegistryService');
const {
  sendErrorMessage,
  isAdminMessage,
  formatDateTime,
} = require('../utils/utils');
const { t } = require('../i18n');
const { sortWebUsersByAddedAtDesc } = require('../cores/adminReadCore');

/**
 * Handle the /list_web_users admin command. Renders the web allowlist
 * as a Markdown table with the linked Telegram nickname/chatName so
 * the admin can verify the mappings at a glance.
 *
 * @param {Object} bot - The Telegram bot instance
 * @param {Object} msg - The Telegram message object
 */
async function handleListWebUsersCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  try {
    const [allowed, users] = await Promise.all([
      listAllowedUsers(),
      listAllUsers().catch((err) => {
        console.error('Error fetching users for list_web_users:', err);

        return [];
      }),
    ]);

    if (allowed.length === 0) {
      await bot
        .sendMessage(chatId, t('No web users allowlisted yet.', chatId))
        .catch((err) =>
          console.error('Error sending empty list_web_users message:', err),
        );

      return;
    }

    const usersByChatId = new Map();
    for (const u of users) {
      usersByChatId.set(String(u.chatId), u);
    }

    const sorted = sortWebUsersByAddedAtDesc(allowed);

    let message = `*${t('Web Allowlist', chatId)}* (${sorted.length})\n\n`;

    sorted.forEach((row, index) => {
      const linkedUser = row.chatId
        ? usersByChatId.get(String(row.chatId))
        : null;
      const linkedDisplay = linkedUser
        ? linkedUser.nickname || linkedUser.chatName || row.chatId
        : t('(unknown)', chatId);

      message += `*${index + 1}. ${row.email}*\n`;
      message += `🆔 ${t('Chat ID', chatId)}: \`${row.chatId || '-'}\` — ${linkedDisplay}\n`;
      if (row.addedAt) {
        const addedAtDate = new Date(row.addedAt);
        if (!Number.isNaN(addedAtDate.getTime())) {
          const formatted = formatDateTime(addedAtDate, chatId);
          message += `📅 ${t('Added', chatId)}: ${formatted.dateStr}, ${formatted.timeStr}\n`;
        }
      }
      if (row.addedBy) {
        message += `👤 ${t('Added by', chatId)}: \`${row.addedBy}\`\n`;
      }
      message += '\n';
    });

    await bot
      .sendMessage(chatId, message, { parse_mode: 'Markdown' })
      .catch((err) =>
        console.error('Error sending list_web_users message:', err),
      );
  } catch (error) {
    console.error('Error in handleListWebUsersCommand:', error);
    await sendErrorMessage(bot, `Error listing web users: ${error.message}`);

    await bot
      .sendMessage(
        chatId,
        t('❌ Error fetching web allowlist: {ERROR}', chatId, {
          ERROR: error.message,
        }),
      )
      .catch((err) =>
        console.error('Error sending list_web_users error message:', err),
      );
  }
}

module.exports = { handleListWebUsersCommand };
