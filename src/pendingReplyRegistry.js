// Registry that maps command identifiers to their handler/validate/prompt builders.
// This enables pending replies to be stored externally (Azure Table Storage) as
// serializable command IDs rather than in-memory functions.
// Supports optional data parameter for multi-step commands that need intermediate state.

const { t } = require('./i18n');
const {
  REPORTED_BUGS_GROUP_ID,
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
} = require('./constants');
const {
  getChatName,
  getDisplayName,
  sendMessageToAdmins,
} = require('./utils/utils');
const { getUserById, listAllUsers, updateUserAttributes } = require('./userRegistryService');
const { userCache } = require('./cache');

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
      const displayName = getDisplayName(chatId);

      const adminMessage = t(
        'Bug report from {DISPLAY_NAME} ({NAME}, {ID}):\n\n{MESSAGE}',
        chatId,
        {
          DISPLAY_NAME: displayName,
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
      const prompt = t(
        'What message would you like to send to the admins?',
        chatId,
      );

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

          let user;
          try {
            user = await getUserById(targetChatId);
          } catch (err) {
            console.error(
              'Error fetching user in send_message_to_user handler:',
              err,
            );
            await replyBot
              .sendMessage(
                chatId,
                t('❌ Error fetching user list: {ERROR}', chatId, {
                  ERROR: err.message,
                }),
              )
              .catch((sendErr) =>
                console.error(
                  'Error sending user list error message:',
                  sendErr,
                ),
              );

            return;
          }

          await registerPendingReply(chatId, 'send_message_to_user', {
            step: 'collect_message',
            targetChatId,
          });

          await replyBot
            .sendMessage(
              chatId,
              t('What message or image do you want to send to {NAME}?', chatId, {
                NAME: user.chatName,
              }),
              { reply_markup: { force_reply: true } },
            )
            .catch((err) =>
              console.error('Error sending collect message prompt:', err),
            );
        } else if (data.step === 'collect_message') {
          // Step 2: Admin provided the message text or photo
          try {
            // Prefix with admin notice localized to the TARGET user's language
            const hasPhoto =
              Array.isArray(replyMsg.photo) && replyMsg.photo.length > 0;
            const photoFileId = hasPhoto
              ? replyMsg.photo[replyMsg.photo.length - 1].file_id
              : null;
            const messageText = replyMsg.text || replyMsg.caption || '';
            const prefixedMessage = t(
              '📩 Message from bot admin:\n\n{MESSAGE}',
              Number(data.targetChatId),
              { MESSAGE: messageText },
            );

            if (hasPhoto) {
              await replyBot.sendPhoto(Number(data.targetChatId), photoFileId, {
                caption: prefixedMessage,
              });
            } else {
              await replyBot.sendMessage(
                Number(data.targetChatId),
                prefixedMessage,
              );
            }

            await replyBot
              .sendMessage(
                chatId,
                t('Content sent successfully to user {ID}.', chatId, {
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
                t('Failed to send content to user {ID}: {ERROR}', chatId, {
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
            const user = await getUserById(replyMsg.text.trim());

            return user !== null;
          } catch (err) {
            console.error('Error validating user ID:', err);

            return false;
          }
        };
      }

      // Step 2: Require text or a photo
      return (replyMsg) =>
        !!replyMsg.text ||
        (Array.isArray(replyMsg.photo) && replyMsg.photo.length > 0);
    },
    buildResendPrompt: (chatId, data) => {
      if (!data || data.step === 'collect_user_id') {
        return t('User not found. Please enter a valid chat ID:', chatId);
      }

      return t(
        'Please enter text or a photo to send.',
        chatId,
      );
    },
  },
  broadcast: {
    buildHandler: (chatId) => async (replyBot, replyMsg) => {
      let users;
      try {
        users = await listAllUsers();
      } catch (err) {
        console.error('Error fetching users for broadcast:', err);
        await replyBot
          .sendMessage(
            chatId,
            t('❌ Error fetching user list: {ERROR}', chatId, {
              ERROR: err.message,
            }),
          )
          .catch((sendErr) =>
            console.error('Error sending user list error message:', sendErr),
          );

        return;
      }

      if (!users || users.length === 0) {
        await replyBot
          .sendMessage(
            chatId,
            t('No registered users found to broadcast to.', chatId),
          )
          .catch((err) =>
            console.error('Error sending no users message:', err),
          );

        return;
      }

      let successCount = 0;
      const failures = [];
      const hasPhoto =
        Array.isArray(replyMsg.photo) && replyMsg.photo.length > 0;
      const photoFileId = hasPhoto
        ? replyMsg.photo[replyMsg.photo.length - 1].file_id
        : null;
      const broadcastText = replyMsg.text || replyMsg.caption || '';

      for (const user of users) {
        try {
          const prefixedMessage = t(
            '📢 Broadcast from bot admin:\n\n{MESSAGE}',
            Number(user.chatId),
            { MESSAGE: broadcastText },
          );

          if (hasPhoto) {
            await replyBot.sendPhoto(Number(user.chatId), photoFileId, {
              caption: prefixedMessage,
            });
          } else {
            await replyBot.sendMessage(Number(user.chatId), prefixedMessage);
          }
          successCount++;
        } catch (err) {
          console.error(`Error sending broadcast to user ${user.chatId}:`, err);
          failures.push(`${user.chatName || 'Unknown'} (${user.chatId})`);
        }
      }

      let summary = t(
        'Broadcast complete.\n\n✅ Sent successfully: {SUCCESS}\n❌ Failed: {FAILED}',
        chatId,
        { SUCCESS: String(successCount), FAILED: String(failures.length) },
      );

      if (failures.length > 0) {
        summary +=
          '\n\n' +
          t('Failed to send to:\n{DETAILS}', chatId, {
            DETAILS: failures.join('\n'),
          });
      }

      await replyBot
        .sendMessage(chatId, summary)
        .catch((err) => console.error('Error sending broadcast summary:', err));
    },
    buildValidate: () => (replyMsg) =>
      !!replyMsg.text ||
      (Array.isArray(replyMsg.photo) && replyMsg.photo.length > 0),
    buildResendPrompt: (chatId) =>
      t(
        'Please enter text or a photo to broadcast.',
        chatId,
      ),
  },
  set_nickname: {
    buildHandler: (chatId, data) => {
      // Lazy require to avoid circular dependency
      const { registerPendingReply } = require('./pendingReplyManager');

      return async (replyBot, replyMsg) => {
        if (!data || data.step === 'collect_user_id') {
          // Step 1: Admin provided a valid target chat ID (validated by buildValidate)
          const targetChatId = replyMsg.text.trim();

          let user;
          try {
            user = await getUserById(targetChatId);
          } catch (err) {
            console.error(
              'Error fetching user in set_nickname handler:',
              err,
            );
            await replyBot
              .sendMessage(
                chatId,
                t('❌ Error fetching user list: {ERROR}', chatId, {
                  ERROR: err.message,
                }),
              )
              .catch((sendErr) =>
                console.error(
                  'Error sending user list error message:',
                  sendErr,
                ),
              );

            return;
          }

          await registerPendingReply(chatId, 'set_nickname', {
            step: 'collect_nickname',
            targetChatId,
            targetChatName: user.chatName,
          });

          await replyBot
            .sendMessage(
              chatId,
              t('Please enter the nickname for {NAME}:', chatId, {
                NAME: user.chatName,
              }),
              { reply_markup: { force_reply: true } },
            )
            .catch((err) =>
              console.error('Error sending collect nickname prompt:', err),
            );
        } else if (data.step === 'collect_nickname') {
          // Step 2: Admin provided the nickname text
          const nickname = replyMsg.text.trim();

          try {
            await updateUserAttributes(data.targetChatId, { nickname });

            // Update in-memory userCache
            const key = String(data.targetChatId);
            if (!userCache[key]) {
              userCache[key] = {};
            }

            userCache[key].nickname = nickname;

            await replyBot
              .sendMessage(
                chatId,
                t('Nickname for {NAME} ({ID}) set to "{NICKNAME}".', chatId, {
                  NAME: data.targetChatName || data.targetChatId,
                  ID: data.targetChatId,
                  NICKNAME: nickname,
                }),
              )
              .catch((err) =>
                console.error('Error sending nickname confirmation:', err),
              );
          } catch (err) {
            console.error('Error setting nickname:', err);

            await replyBot
              .sendMessage(
                chatId,
                t('❌ Error setting nickname: {ERROR}', chatId, {
                  ERROR: err.message,
                }),
              )
              .catch((sendErr) =>
                console.error('Error sending nickname error message:', sendErr),
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
            const user = await getUserById(replyMsg.text.trim());

            return user !== null;
          } catch (err) {
            console.error('Error validating user ID for nickname:', err);

            return false;
          }
        };
      }

      // Step 2: Only require text
      return (replyMsg) => !!replyMsg.text;
    },
    buildResendPrompt: (chatId, data) => {
      if (!data || data.step === 'collect_user_id') {
        return t('User not found. Please enter a valid chat ID:', chatId);
      }

      return t(
        'We support only text. Please enter the nickname.',
        chatId,
      );
    },
  },
  upload_drivers_photo: {
    buildHandler: (chatId) => async (replyBot, replyMsg) => {
      const { processPhotoByType } = require('./photoProcessingService');
      const photoArray = replyMsg.photo;
      const largestPhoto = photoArray[photoArray.length - 1];
      await processPhotoByType(
        replyBot,
        chatId,
        DRIVERS_PHOTO_TYPE,
        largestPhoto.file_id,
        largestPhoto.file_unique_id,
      );
    },
    buildValidate: () => (replyMsg) =>
      Array.isArray(replyMsg.photo) && replyMsg.photo.length > 0,
    buildResendPrompt: (chatId) =>
      t(
        'We support only photo replies for this command. Please send a drivers screenshot.',
        chatId,
      ),
  },
  upload_constructors_photo: {
    buildHandler: (chatId) => async (replyBot, replyMsg) => {
      const { processPhotoByType } = require('./photoProcessingService');
      const photoArray = replyMsg.photo;
      const largestPhoto = photoArray[photoArray.length - 1];
      await processPhotoByType(
        replyBot,
        chatId,
        CONSTRUCTORS_PHOTO_TYPE,
        largestPhoto.file_id,
        largestPhoto.file_unique_id,
      );
    },
    buildValidate: () => (replyMsg) =>
      Array.isArray(replyMsg.photo) && replyMsg.photo.length > 0,
    buildResendPrompt: (chatId) =>
      t(
        'We support only photo replies for this command. Please send a constructors screenshot.',
        chatId,
      ),
  },
  follow_league: {
    buildHandler: (chatId) => {
      // Lazy require to avoid circular dependency via pendingReplyManager
      const { registerPendingReply } = require('./pendingReplyManager');
      const { getLeagueData } = require('./azureStorageService');
      const { addUserLeague } = require('./leagueRegistryService');
      const { sendLogMessage } = require('./utils/utils');

      return async (replyBot, replyMsg) => {
        const leagueCode = replyMsg.text.trim();

        let leagueData;
        try {
          leagueData = await getLeagueData(leagueCode);
        } catch (err) {
          console.error('Error fetching league data for follow:', err);
          await replyBot
            .sendMessage(
              chatId,
              t('❌ Failed to load league data: {ERROR}', chatId, {
                ERROR: err.message,
              }),
            )
            .catch((sendErr) =>
              console.error(
                'Error sending league fetch error message:',
                sendErr,
              ),
            );

          return;
        }

        if (!leagueData) {
          // Blob missing → treat as invalid code; re-register pending reply
          // so the user can try again without re-typing the command.
          await registerPendingReply(chatId, 'follow_league');

          const retryPrompt = [
            t(
              'League "{CODE}" not found. Please enter a valid league code:',
              chatId,
              { CODE: leagueCode },
            ),
            '',
            t(
              'To find your league code: go to the F1 Fantasy website, open the league you want to follow, click the share button, and copy the league code from there.',
              chatId,
            ),
            '',
            t(
              '📩 If the code is correct but the league is not yet tracked, please report it to the admins via /report_bug with the league code and we will add the bot to the league as soon as possible.',
              chatId,
            ),
            '',
            t('💡 Send /cancel at any time to abort.', chatId),
          ].join('\n');

          await replyBot
            .sendMessage(chatId, retryPrompt, {
              reply_markup: { force_reply: true },
            })
            .catch((err) =>
              console.error('Error sending league-not-found prompt:', err),
            );

          return;
        }

        const leagueName = leagueData.leagueName || leagueCode;

        try {
          await addUserLeague(chatId, leagueCode, leagueName);
        } catch (err) {
          console.error('Error persisting league follow:', err);
          await replyBot
            .sendMessage(
              chatId,
              t('❌ Failed to follow league: {ERROR}', chatId, {
                ERROR: err.message,
              }),
            )
            .catch((sendErr) =>
              console.error(
                'Error sending league follow error message:',
                sendErr,
              ),
            );

          return;
        }

        await replyBot
          .sendMessage(
            chatId,
            t(
              'Now following league "{NAME}" ({CODE}).',
              chatId,
              { NAME: leagueName, CODE: leagueCode },
            ),
          )
          .catch((err) =>
            console.error('Error sending league follow confirmation:', err),
          );

        await sendLogMessage(
          replyBot,
          `Followed league ${leagueName} (${leagueCode}) for chatId ${chatId}`,
        ).catch(() => {});
      };
    },
    buildValidate: () => (replyMsg) =>
      !!replyMsg.text && replyMsg.text.trim().length > 0,
    buildResendPrompt: (chatId) =>
      t(
        'We support only text. Please enter the league code:',
        chatId,
      ),
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
