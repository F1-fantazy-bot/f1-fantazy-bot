// Registry that maps command identifiers to their handler/validate/prompt builders.
// This enables pending replies to be stored externally (Azure Table Storage) as
// serializable command IDs rather than in-memory functions.
// Supports optional data parameter for multi-step commands that need intermediate state.

const { t } = require('./i18n');
const { REPORTED_BUGS_GROUP_ID } = require('./constants');
const { getChatName, sendMessageToAdmins } = require('./utils/utils');
const { listAllUsers } = require('./userRegistryService');

/**
 * Each entry provides builder functions that reconstruct the handler, validator,
 * and resend prompt for a given chatId. This allows any server instance to
 * recreate the full pending reply behavior from just a command ID + chatId.
 *
 * Builder functions receive (chatId, data) where data is optional stored state
 * for multi-step commands. Single-step commands can ignore the data parameter.
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

      await replyBot
        .sendMessage(REPORTED_BUGS_GROUP_ID, adminMessage)
        .catch((err) =>
          console.error('Error sending bug report to bugs group:', err),
        );

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
  send_message_to_user: {
    buildHandler: (chatId, data) => {
      // Lazy require to avoid circular dependency
      const { registerPendingReply } = require('./pendingReplyManager');

      return async (replyBot, replyMsg) => {
        if (!data || data.step === 'collect_user_id') {
          // Step 1: Admin provided a valid target chat ID (validated by buildValidate)
          const targetChatId = replyMsg.text.trim();

          let users;
          try {
            users = await listAllUsers();
          } catch (err) {
            console.error('Error fetching users in send_message_to_user handler:', err);
            await replyBot
              .sendMessage(
                chatId,
                t('❌ Error fetching user list: {ERROR}', chatId, { ERROR: err.message }),
              )
              .catch((sendErr) =>
                console.error('Error sending user list error message:', sendErr),
              );

            return;
          }

          const user = users.find((u) => u.chatId === targetChatId);

          await registerPendingReply(chatId, 'send_message_to_user', {
            step: 'collect_message',
            targetChatId,
          });

          await replyBot
            .sendMessage(
              chatId,
              t('What message do you want to send to {NAME}?', chatId, {
                NAME: user.chatName,
              }),
              { reply_markup: { force_reply: true } },
            )
            .catch((err) =>
              console.error('Error sending collect message prompt:', err),
            );
        } else if (data.step === 'collect_message') {
          // Step 2: Admin provided the message text
          try {
            // Prefix with admin notice localized to the TARGET user's language
            const prefixedMessage = t(
              '📩 Message from bot admin:\n\n{MESSAGE}',
              Number(data.targetChatId),
              { MESSAGE: replyMsg.text },
            );

            await replyBot.sendMessage(Number(data.targetChatId), prefixedMessage);

            await replyBot
              .sendMessage(
                chatId,
                t('Message sent successfully to user {ID}.', chatId, {
                  ID: data.targetChatId,
                }),
              )
              .catch((err) =>
                console.error('Error sending confirmation message:', err),
              );
          } catch (err) {
            console.error('Error sending message to target user:', err);

            await replyBot
              .sendMessage(
                chatId,
                t('Failed to send message to user {ID}: {ERROR}', chatId, {
                  ID: data.targetChatId,
                  ERROR: err.message,
                }),
              )
              .catch((sendErr) =>
                console.error('Error sending failure notification:', sendErr),
              );
          }
        }
      };
    },
    buildValidate: (chatId, data) => {
      if (!data || data.step === 'collect_user_id') {
        // Step 1: Validate text is present AND chat ID exists in user registry
        return async (replyMsg) => {
          if (!replyMsg.text) {
            return false;
          }

          try {
            const users = await listAllUsers();

            return users.some((u) => u.chatId === replyMsg.text.trim());
          } catch (err) {
            console.error('Error validating user ID:', err);

            return false;
          }
        };
      }

      // Step 2: Only require text
      return (replyMsg) => !!replyMsg.text;
    },
    buildResendPrompt: (chatId, data) => {
      if (!data || data.step === 'collect_user_id') {
        return t(
          'User not found. Please enter a valid chat ID:',
          chatId,
        );
      }

      return t(
        'We support only text. Please enter the message to send.',
        chatId,
      );
    },
  },
};

/**
 * Resolve a command ID to its full handler entry for a given chatId.
 * @param {string} commandId - The command identifier (e.g., 'report_bug')
 * @param {number} chatId - The chat ID to build handlers for
 * @returns {{ handler: function, validate: function|null, resendPromptIfNotValid: string|null }|null}
 */
function resolveCommand(commandId, chatId, data = null) {
  const entry = PENDING_REPLY_REGISTRY[commandId];

  if (!entry) {
    console.error(`Unknown pending reply command: ${commandId}`);

    return null;
  }

  return {
    handler: entry.buildHandler(chatId, data),
    validate: entry.buildValidate ? entry.buildValidate(chatId, data) : null,
    resendPromptIfNotValid: entry.buildResendPrompt
      ? entry.buildResendPrompt(chatId, data)
      : null,
  };
}

module.exports = { PENDING_REPLY_REGISTRY, resolveCommand };
