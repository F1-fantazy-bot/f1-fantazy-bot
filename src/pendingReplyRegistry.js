// Registry that maps command identifiers to their handler/validate/prompt builders.
// This enables pending replies to be stored externally (Azure Table Storage) as
// serializable command IDs rather than in-memory functions.

const { t } = require('./i18n');
const { getChatName, sendMessageToAdmins } = require('./utils/utils');

/**
 * Each entry provides builder functions that reconstruct the handler, validator,
 * and resend prompt for a given chatId. This allows any server instance to
 * recreate the full pending reply behavior from just a command ID + chatId.
 */
const PENDING_REPLY_REGISTRY = {
  report_bug: {
    buildHandler: (chatId) => async (replyBot, replyMsg) => {
      const chatName = getChatName(replyMsg);

      const adminMessage = t(
        'Bug report from {NAME} ({ID}):\n\n{MESSAGE}',
        chatId,
        {
          NAME: chatName,
          ID: chatId,
          MESSAGE: replyMsg.text,
        },
      );

      await sendMessageToAdmins(replyBot, adminMessage);

      const confirmation = t(
        'Your message has been sent to the admins. Thank you!',
        chatId,
      );

      await replyBot
        .sendMessage(chatId, confirmation)
        .catch((err) =>
          console.error('Error sending bug report confirmation:', err),
        );
    },
    buildValidate: () => (replyMsg) => !!replyMsg.text,
    buildResendPrompt: (chatId) => {
      const prompt = t('What message would you like to send to the admins?', chatId);

      return t('We support only text. {PROMPT}', chatId, { PROMPT: prompt });
    },
  },
};

/**
 * Resolve a command ID to its full handler entry for a given chatId.
 * @param {string} commandId - The command identifier (e.g., 'report_bug')
 * @param {number} chatId - The chat ID to build handlers for
 * @returns {{ handler: function, validate: function|null, resendPromptIfNotValid: string|null }|null}
 */
function resolveCommand(commandId, chatId) {
  const entry = PENDING_REPLY_REGISTRY[commandId];

  if (!entry) {
    console.error(`Unknown pending reply command: ${commandId}`);

    return null;
  }

  return {
    handler: entry.buildHandler(chatId),
    validate: entry.buildValidate ? entry.buildValidate() : null,
    resendPromptIfNotValid: entry.buildResendPrompt ? entry.buildResendPrompt(chatId) : null,
  };
}

module.exports = { PENDING_REPLY_REGISTRY, resolveCommand };
