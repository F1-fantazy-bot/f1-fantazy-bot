const { t } = require('../i18n');
const { isAdminMessage } = require('../utils/utils');
const { registerPendingReply } = require('../pendingReplyManager');

async function handleUploadConstructorsPhotoCommand(bot, msg) {
  const chatId = msg.chat.id;

  if (!isAdminMessage(msg)) {
    await bot.sendMessage(
      chatId,
      t('Sorry, only admins can use this command.', chatId),
    );

    return;
  }

  await registerPendingReply(chatId, 'upload_constructors_photo');

  await bot.sendMessage(
    chatId,
    t('Please send a constructors screenshot.', chatId),
    { reply_markup: { force_reply: true } },
  );
}

module.exports = { handleUploadConstructorsPhotoCommand };
