const { isAdminMessage, sendErrorMessage } = require('../utils');
const { t } = require('../i18n');
const { getLatestAnnouncement } = require('../announcementsService');
const { MAX_TELEGRAM_MESSAGE_LENGTH } = require('../constants');

async function handleWhatsNewCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  const latest = getLatestAnnouncement();
  if (!latest || !latest.text) {
    await bot.sendMessage(
      chatId,
      t('No release notes available yet.', chatId),
    );

    return;
  }

  let text = latest.text;
  if (text.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
    text = `${text.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH - 1)}…`;
    await sendErrorMessage(
      bot,
      `whats_new: latest announcement (id=${latest.id}) exceeds Telegram's ${MAX_TELEGRAM_MESSAGE_LENGTH} char limit and was truncated.`,
    ).catch(() => {});
  }

  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(
      'whats_new: markdown send failed, retrying as plain text:',
      err,
    );
    await bot.sendMessage(chatId, text);
  }
}

module.exports = { handleWhatsNewCommand };
