const { sendErrorMessage } = require('../utils');
const { t } = require('../i18n');
const { getLatestAnnouncement } = require('../announcementsService');
const { MAX_TELEGRAM_MESSAGE_LENGTH } = require('../constants');

function escapeCommandUnderscores(text) {
  // In Telegram legacy Markdown, '_' starts italic. Command names like
  // /best_teams would have their underscores consumed. Escape '_' only
  // inside /command tokens so the text still renders as '/best_teams' and
  // Telegram auto-links it as a command.
  return text.replace(/\/[A-Za-z][A-Za-z0-9_]*/g, (match) =>
    match.replace(/_/g, '\\_'),
  );
}

async function handleWhatsNewCommand(bot, msg) {
  const chatId = msg.chat.id;

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

  const markdownText = escapeCommandUnderscores(text);

  try {
    await bot.sendMessage(chatId, markdownText, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error(
      'whats_new: markdown send failed, retrying as plain text:',
      err,
    );
    await bot.sendMessage(chatId, text);
  }
}

module.exports = { handleWhatsNewCommand };
