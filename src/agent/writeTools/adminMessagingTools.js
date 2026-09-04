const z = require('zod');
const { sendLogMessage } = require('../../utils/utils');
const {
  createAdminMessagingService,
  inspectAgentMessage,
  STATUS,
} = require('../../services/adminMessagingService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { getRequestContext } = require('../requestContext');
const { getNotifierBot } = require('../notifierBot');
const { defineAdminWriteTool } = require('../adminAuthorization');
const {
  WRITE_RESULT_STATUSES,
} = require('../writeToolHelpers');

const parameters = z.object({
  message: z.string(),
});

const directParameters = parameters.extend({
  chatId: z.string(),
});

function auditMessage(event) {
  const target = event.targetChatId
    ? `target=${event.targetChatId}`
    : `audience=${event.audienceCount || 0}`;
  const counts =
    event.sent === undefined
      ? ''
      : ` sent=${event.sent} failed=${event.failed}`;
  const email = getRequestContext()?.email;
  const actor = email
    ? `${event.actorChatId} (${email})`
    : String(event.actorChatId);

  return `Agent admin messaging ${event.action} actor=${actor} ${target} outcome=${event.outcome}${counts}`;
}

function createAgentAdminMessagingService() {
  const bot = getNotifierBot();

  return createAdminMessagingService({
    messenger: bot,
    audit: (event) => sendLogMessage(bot, auditMessage(event)),
  });
}

function validationStatus(result, tool) {
  return {
    ...result,
    tool,
    status:
      result.status === STATUS.NOT_FOUND
        ? WRITE_RESULT_STATUSES.NOT_FOUND
        : WRITE_RESULT_STATUSES.INVALID_INPUT,
  };
}

function publicResult(result, tool) {
  const {
    errorMessage: _errorMessage,
    failureLabels: _failureLabels,
    recipient,
    audience,
    ...safeResult
  } = result;
  const status =
    result.status === STATUS.CHANGED
      ? WRITE_RESULT_STATUSES.INVALID_INPUT
      : result.status;

  // Registry records contain operational fields (language, timestamps, and
  // potentially future metadata). A write result only needs a compact display
  // identity. Likewise, the audience fingerprint is an internal stale-write
  // guard, not a chat result.
  const safeRecipient = recipient
    ? {
        chatId: String(recipient.chatId || ''),
        name: recipient.nickname || recipient.chatName || String(recipient.chatId || ''),
      }
    : undefined;
  const safeAudience = audience ? { count: audience.count } : undefined;

  return {
    ...safeResult,
    ...(safeRecipient ? { recipient: safeRecipient } : {}),
    ...(safeAudience ? { audience: safeAudience } : {}),
    tool,
    status,
  };
}

const sendUserMessageTool = defineAdminWriteTool({
  name: 'send_user_message',
  description:
    'Admin only. Send a text message to one exact registered Telegram bot user. Use list_bot_users with selectionMode="send_user_message" for canonical clickable recipient choices. The agent cannot send images. Always requires confirmation.',
  parameters: directParameters,
  validate: async ({ chatId: actorChatId, args }) => {
    await getFreshLanguagePreference(actorChatId);
    const text = inspectAgentMessage({
      chatId: actorChatId,
      message: args.message,
    });
    if (text.status !== STATUS.OK) {
      return validationStatus(text, 'send_user_message');
    }

    const service = createAgentAdminMessagingService();
    const recipient = await service.inspectRecipient({
      chatId: actorChatId,
      targetChatId: args.chatId,
    });
    if (recipient.status !== STATUS.OK) {
      return validationStatus(recipient, 'send_user_message');
    }

    return {
      args: { chatId: recipient.targetChatId, message: text.message },
      summary: service.buildDirectSummary({
        chatId: actorChatId,
        recipient: recipient.recipient,
        message: text.message,
      }),
    };
  },
  buildSummary: ({ args }) => `Send a message to ${args.chatId}.`,
  commit: async ({ chatId: actorChatId, args }) =>
    publicResult(
      await createAgentAdminMessagingService().sendDirect({
        actorChatId,
        targetChatId: args.chatId,
        message: args.message,
      }),
      'send_user_message',
    ),
});

const broadcastMessageTool = defineAdminWriteTool({
  name: 'broadcast_message',
  description:
    'Admin only. Send a text message to every currently registered Telegram bot user. The agent cannot send images. The confirmation preview includes the exact current recipient count; delivery is blocked if that audience changes before confirmation.',
  parameters,
  validate: async ({ chatId: actorChatId, args }) => {
    await getFreshLanguagePreference(actorChatId);
    const text = inspectAgentMessage({
      chatId: actorChatId,
      message: args.message,
    });
    if (text.status !== STATUS.OK) {
      return validationStatus(text, 'broadcast_message');
    }

    const service = createAgentAdminMessagingService();
    const audience = await service.inspectAudience({ chatId: actorChatId });
    if (audience.status !== STATUS.OK) {
      return validationStatus(audience, 'broadcast_message');
    }

    return {
      args: { message: text.message },
      intentArgs: {
        message: text.message,
        expectedAudienceFingerprint: audience.audience.fingerprint,
      },
      summary: service.buildBroadcastSummary({
        chatId: actorChatId,
        audience: audience.audience,
        message: text.message,
      }),
    };
  },
  buildSummary: () => 'Broadcast a message to all registered users.',
  commit: async ({ chatId: actorChatId, args }) =>
    publicResult(
      await createAgentAdminMessagingService().broadcast({
        actorChatId,
        message: args.message,
        expectedAudienceFingerprint: args.expectedAudienceFingerprint,
      }),
      'broadcast_message',
    ),
});

module.exports = {
  createAgentAdminMessagingService,
  auditMessage,
  sendUserMessageTool,
  broadcastMessageTool,
};
