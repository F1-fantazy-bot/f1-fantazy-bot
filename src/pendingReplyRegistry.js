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
  sendErrorMessage,
  sendMessageToAdmins,
  sendLogMessage,
} = require('./utils/utils');
const {
  createReportBugService,
  MAX_BUG_REPORT_LENGTH,
} = require('./services/reportBugService');
const { getUserById } = require('./userRegistryService');
const { createAdminAccessService, isValidEmail } = require('./services/adminAccessService');
const { createAdminMessagingService } = require('./services/adminMessagingService');

function adminAccessService() {
  return createAdminAccessService();
}

function adminMessagingService(replyBot) {
  return createAdminMessagingService({ messenger: replyBot });
}

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
      const reportBugService = createReportBugService({
        messenger: {
          sendToAdmins: (text) => sendMessageToAdmins(replyBot, text),
          sendToBugsGroup: async (text) => {
            try {
              await replyBot.sendMessage(REPORTED_BUGS_GROUP_ID, text);
            } catch (err) {
              await sendErrorMessage(
                replyBot,
                `Bug report delivery to bugs group failed: ${err.message}`,
              );
            }
          },
        },
      });
      const result = await reportBugService.report({
        chatId,
        message: replyMsg.text,
        source: 'telegram',
        chatName,
        displayName,
      });

      await replyBot
        .sendMessage(chatId, result.summary)
        .catch((err) =>
          console.error('Error sending bug report confirmation:', err),
        );
    },
    buildValidate: () => (replyMsg) =>
      typeof replyMsg.text === 'string' &&
      replyMsg.text.trim().length > 0 &&
      replyMsg.text.trim().length <= MAX_BUG_REPORT_LENGTH,
    buildResendPrompt: (chatId) => {
      const prompt = t(
        'What message would you like to send to the admins?',
        chatId,
      );

      return t(
        'We support only text messages up to {MAX} characters. {PROMPT}',
        chatId,
        {
          MAX: MAX_BUG_REPORT_LENGTH,
          PROMPT: prompt,
        },
      );
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

          let inspected;
          try {
            inspected = await adminMessagingService(replyBot).inspectRecipient({
              chatId,
              targetChatId,
            });
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

          if (inspected.status !== 'ok') {
            return;
          }

          await registerPendingReply(chatId, 'send_message_to_user', {
            step: 'collect_message',
            targetChatId,
          });

          const collectMessagePrompt = `${t(
            'What message or image do you want to send to {NAME}?',
            chatId,
            { NAME: inspected.recipient.chatName },
          )}\n\n${t('💡 Send /cancel at any time to abort.', chatId)}`;

          await replyBot
            .sendMessage(chatId, collectMessagePrompt, {
              reply_markup: { force_reply: true },
            })
            .catch((err) =>
              console.error('Error sending collect message prompt:', err),
            );
        } else if (data.step === 'collect_message') {
          // Step 2: Admin provided the message text or photo
          try {
            const hasPhoto =
              Array.isArray(replyMsg.photo) && replyMsg.photo.length > 0;
            const photoFileId = hasPhoto
              ? replyMsg.photo[replyMsg.photo.length - 1].file_id
              : null;
            const messageText = replyMsg.text || replyMsg.caption || '';
            const result = await adminMessagingService(replyBot).sendDirect({
              actorChatId: chatId,
              targetChatId: data.targetChatId,
              message: messageText,
              photoFileId,
            });

            if (result.status !== 'ok') {
              const deliveryError = new Error(
                result.errorMessage || result.summary,
              );
              console.error(
                'Error sending message to target user:',
                deliveryError,
              );
              await replyBot
                .sendMessage(
                  chatId,
                  t('Failed to send content to user {ID}: {ERROR}', chatId, {
                    ID: data.targetChatId,
                    ERROR: result.errorMessage || result.summary,
                  }),
                )
                .catch((sendErr) =>
                  console.error('Error sending failure notification:', sendErr),
                );

              return;
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
      let result;
      try {
        const hasPhoto =
          Array.isArray(replyMsg.photo) && replyMsg.photo.length > 0;
        const photoFileId = hasPhoto
          ? replyMsg.photo[replyMsg.photo.length - 1].file_id
          : null;
        const broadcastText = replyMsg.text || replyMsg.caption || '';
        result = await adminMessagingService(replyBot).broadcast({
          actorChatId: chatId,
          message: broadcastText,
          photoFileId,
        });
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

      if (result.status === 'not_found') {
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

      const successCount = result.delivery.sent;
      const failures = result.failureLabels;

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

          let inspected;
          try {
            inspected = await adminAccessService().inspectNickname({
              chatId,
              targetChatId,
            });
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

          if (inspected.status !== 'ok') {
            return;
          }

          await registerPendingReply(chatId, 'set_nickname', {
            step: 'collect_nickname',
            targetChatId,
            targetChatName: inspected.user.chatName,
          });

          const collectNicknamePrompt = `${t(
            'Please enter the nickname for {NAME}:',
            chatId,
            { NAME: inspected.user.chatName },
          )}\n\n${t('💡 Send /cancel at any time to abort.', chatId)}`;

          await replyBot
            .sendMessage(chatId, collectNicknamePrompt, {
              reply_markup: { force_reply: true },
            })
            .catch((err) =>
              console.error('Error sending collect nickname prompt:', err),
            );
        } else if (data.step === 'collect_nickname') {
          // Step 2: Admin provided the nickname text
          const nickname = replyMsg.text.trim();

          try {
            const result = await adminAccessService().setUserNickname({
              chatId,
              targetChatId: data.targetChatId,
              nickname,
            });
            if (result.status !== 'ok') {
              return;
            }

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
            const inspected = await adminAccessService().inspectNickname({
              chatId,
              targetChatId: replyMsg.text.trim(),
            });

            return inspected.status === 'ok';
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
      const { followLeague } = require('./services/followLeagueService');
      const { sendLogMessage } = require('./utils/utils');

      return async (replyBot, replyMsg) => {
        const leagueCode = replyMsg.text.trim();

        let result;
        try {
          result = await followLeague({ chatId, leagueCode });
        } catch (err) {
          console.error('Error fetching league data for follow:', err);
          await replyBot
            .sendMessage(
              chatId,
              t('❌ Failed to follow league. Please try again.', chatId),
            )
            .catch((sendErr) =>
              console.error(
                'Error sending league fetch error message:',
                sendErr,
              ),
            );

          return;
        }

        if (result.status !== 'ok') {
          // Blob missing → treat as invalid code; re-register pending reply
          // so the user can try again without re-typing the command.
          await registerPendingReply(chatId, 'follow_league');

          const retryPrompt = [
            t(
              'League "{CODE}" not found. Please enter a valid league code:',
              chatId,
              { CODE: result.leagueCode || leagueCode },
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

        await replyBot
          .sendMessage(chatId, result.summary)
          .catch((err) =>
            console.error('Error sending league follow confirmation:', err),
          );

        await sendLogMessage(
          replyBot,
          `Followed league ${result.leagueName} (${result.leagueCode}) for chatId ${chatId}`,
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
  allow_web_user: {
    buildHandler: (chatId, data) => {
      const { registerPendingReply } = require('./pendingReplyManager');

      return async (replyBot, replyMsg) => {
        if (!data || data.step === 'collect_email') {
          const email = replyMsg.text.trim().toLowerCase();

          await registerPendingReply(chatId, 'allow_web_user', {
            step: 'collect_chat_id',
            email,
          });

          const prompt = `${t(
            'Got it: {EMAIL}. Now please enter the chat ID to map this email to:',
            chatId,
            { EMAIL: email },
          )}\n\n${t('💡 Send /cancel at any time to abort.', chatId)}`;

          await replyBot
            .sendMessage(chatId, prompt, {
              reply_markup: { force_reply: true },
            })
            .catch((err) =>
              console.error('Error sending allow_web_user step-2 prompt:', err),
            );

          return;
        }

        if (data.step === 'collect_chat_id') {
          const targetChatId = replyMsg.text.trim();

          let result;
          try {
            result = await adminAccessService().allowWebUser({
              chatId,
              email: data.email,
              targetChatId,
            });
          } catch (err) {
            const writeError = err.adminAccessOperation === 'allow_web_user';
            console.error(
              writeError
                ? 'Error writing web allowlist:'
                : 'Error fetching user in allow_web_user handler:',
              err,
            );
            await replyBot
              .sendMessage(
                chatId,
                t(
                  writeError
                    ? '❌ Error allowlisting user: {ERROR}'
                    : '❌ Error fetching user: {ERROR}',
                  chatId,
                  {
                  ERROR: err.message,
                  },
                ),
              )
              .catch((sendErr) =>
                console.error('Error sending allow_web_user error:', sendErr),
              );

            return;
          }

          if (result.status !== 'ok') {
            return;
          }

          const linkedName =
            result.user.nickname || result.user.chatName || targetChatId;
          await replyBot
            .sendMessage(
              chatId,
              t(
                '✅ Allowed {EMAIL} on the web agent, mapped to {NAME} ({ID}).',
                chatId,
                { EMAIL: data.email, NAME: linkedName, ID: targetChatId },
              ),
            )
            .catch((err) =>
              console.error('Error sending allow_web_user confirmation:', err),
            );

          await sendLogMessage(
            replyBot,
            `Allowed web user ${data.email} → chatId ${targetChatId} (added by ${chatId})`,
          ).catch(() => {});
        }
      };
    },
    buildValidate: (chatId, data) => {
      if (!data || data.step === 'collect_email') {
        return (replyMsg) => isValidEmail(replyMsg.text);
      }

      // Step 2: chat ID must exist in the user registry.
      return async (replyMsg) => {
        if (!replyMsg.text) {
          return false;
        }

        try {
          const inspected = await adminAccessService().inspectNickname({
            chatId,
            targetChatId: replyMsg.text.trim(),
          });

          return inspected.status === 'ok';
        } catch (err) {
          console.error('Error validating chat ID for allow_web_user:', err);

          return false;
        }
      };
    },
    buildResendPrompt: (chatId, data) => {
      if (!data || data.step === 'collect_email') {
        return t('Please enter a valid Google email address.', chatId);
      }

      return t(
        'Chat ID not found in the registry. Please enter a valid chat ID:',
        chatId,
      );
    },
  },
  revoke_web_user: {
    buildHandler: (chatId) => async (replyBot, replyMsg) => {
      const email = replyMsg.text.trim().toLowerCase();

      let result;
      try {
        result = await adminAccessService().revokeWebUser({ chatId, email });
      } catch (err) {
        const writeError = err.adminAccessOperation === 'revoke_web_user';
        console.error(
          writeError
            ? 'Error removing web allowlist row:'
            : 'Error looking up web user for revoke:',
          err,
        );
        await replyBot
          .sendMessage(
            chatId,
            t(
              writeError
                ? '❌ Error revoking web user: {ERROR}'
                : '❌ Error looking up web user: {ERROR}',
              chatId,
              {
              ERROR: err.message,
              },
            ),
          )
          .catch((sendErr) =>
            console.error('Error sending revoke lookup error:', sendErr),
          );

        return;
      }

      if (result.status === 'not_found') {
        await replyBot
          .sendMessage(
            chatId,
            t('{EMAIL} was not on the web allowlist — nothing to do.', chatId, {
              EMAIL: email,
            }),
          )
          .catch((err) =>
            console.error('Error sending revoke not-found message:', err),
          );

        return;
      }

      if (result.status !== 'ok') {
        return;
      }

      await replyBot
        .sendMessage(
          chatId,
          t('🚫 Revoked {EMAIL} from the web agent allowlist.', chatId, {
            EMAIL: email,
          }),
        )
        .catch((err) =>
          console.error('Error sending revoke confirmation:', err),
        );

      await sendLogMessage(
        replyBot,
        `Revoked web user ${email} (revoked by ${chatId})`,
      ).catch(() => {});
    },
    buildValidate: () => (replyMsg) => isValidEmail(replyMsg.text),
    buildResendPrompt: (chatId) =>
      t('Please enter a valid Google email address.', chatId),
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
