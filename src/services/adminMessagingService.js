// Shared delivery service for administrator-to-user messages.
//
// Telegram keeps its established text/photo reply flows while the web agent
// uses the same recipient/audience checks and delivery path through confirmed,
// text-only writes. The service deliberately keeps transport errors internal;
// the agent adapter strips them before returning a result to chat.

const crypto = require('crypto');
const { t } = require('../i18n');
const userRegistryService = require('../userRegistryService');
const { normalizeChatId, displayName } = require('./adminAccessService');

const MAX_AGENT_MESSAGE_LENGTH = 12000;
const MAX_TELEGRAM_TEXT_LENGTH = 4096;
const MAX_FAILURE_DETAILS = 20;
const MAX_PREVIEW_LENGTH = 600;

const STATUS = Object.freeze({
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
  NOT_FOUND: 'not_found',
  CHANGED: 'changed',
  FAILED: 'failed',
});

function normalizeAgentMessage(message) {
  return typeof message === 'string' ? message.trim() : '';
}

function inspectAgentMessage({ chatId, message } = {}) {
  const normalizedMessage = normalizeAgentMessage(message);
  if (!normalizedMessage) {
    return {
      status: STATUS.INVALID_INPUT,
      summary: t('Please enter a message to send.', chatId),
      maxLength: MAX_AGENT_MESSAGE_LENGTH,
    };
  }
  if (normalizedMessage.length > MAX_AGENT_MESSAGE_LENGTH) {
    return {
      status: STATUS.INVALID_INPUT,
      summary: t('Messages can contain at most {MAX} characters.', chatId, {
        MAX: MAX_AGENT_MESSAGE_LENGTH,
      }),
      maxLength: MAX_AGENT_MESSAGE_LENGTH,
    };
  }

  return {
    status: STATUS.OK,
    message: normalizedMessage,
    length: normalizedMessage.length,
  };
}

function recipientFingerprint(chatId) {
  return crypto.createHash('sha256').update(String(chatId)).digest('hex');
}

function audienceFingerprint(users) {
  return crypto
    .createHash('sha256')
    .update(users.map((user) => user.chatId).sort().join('\n'))
    .digest('hex');
}

function normalizeAudience(users) {
  if (!Array.isArray(users)) {
    return [];
  }

  return users
    .map((user) => ({
      ...user,
      chatId: normalizeChatId(user?.chatId),
    }))
    .filter((user) => Boolean(user.chatId));
}

function preview(message) {
  if (message.length <= MAX_PREVIEW_LENGTH) {
    return message;
  }

  return `${message.slice(0, MAX_PREVIEW_LENGTH - 1)}…`;
}

function previewNotice(chatId, message) {
  if (message.length <= MAX_PREVIEW_LENGTH) {
    return '';
  }

  return `\n\n${t(
    'Preview truncated. The complete {LENGTH}-character message will be delivered.',
    chatId,
    { LENGTH: message.length },
  )}`;
}

function buildDirectSummary({ chatId, recipient, message }) {
  const targetName = displayName(recipient, recipient.chatId);

  return `${t(
    'Send this message to {NAME} ({ID}):',
    chatId,
    { NAME: targetName, ID: recipient.chatId },
  )}\n\n${preview(message)}${previewNotice(chatId, message)}`;
}

function buildBroadcastSummary({ chatId, audience, message }) {
  return `${t(
    'Broadcast this message to {COUNT} registered users:',
    chatId,
    { COUNT: audience.count },
  )}\n\n${preview(message)}${previewNotice(chatId, message)}`;
}

function partHeading(chatId, current, total) {
  return t('Message part {CURRENT}/{TOTAL}:\n\n', chatId, {
    CURRENT: current,
    TOTAL: total,
  });
}

function splitTextForTelegram({ recipientChatId, prefixKey, message }) {
  const recipientId = Number(recipientChatId);
  const fullMessage = t(prefixKey, recipientId, { MESSAGE: message });
  if (fullMessage.length <= MAX_TELEGRAM_TEXT_LENGTH) {
    return [fullMessage];
  }

  const prefix = t(prefixKey, recipientId, { MESSAGE: '' });
  let chunkSize = Math.max(
    1,
    MAX_TELEGRAM_TEXT_LENGTH - prefix.length - 32,
  );
  let total = 0;

  // Account for localized part labels before the final split. The bounded
  // agent message size makes this converge immediately in practice.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    total = Math.ceil(message.length / chunkSize);
    const nextChunkSize = Math.max(
      1,
      MAX_TELEGRAM_TEXT_LENGTH -
        prefix.length -
        partHeading(recipientId, total, total).length,
    );
    if (nextChunkSize === chunkSize) {
      break;
    }
    chunkSize = nextChunkSize;
  }

  const chunks = [];
  for (let offset = 0; offset < message.length; offset += chunkSize) {
    chunks.push(message.slice(offset, offset + chunkSize));
  }

  return chunks.map(
    (chunk, index) =>
      `${prefix}${partHeading(recipientId, index + 1, chunks.length)}${chunk}`,
  );
}

function failureLabel(user) {
  return `${user.chatName || user.nickname || 'Unknown'} (${user.chatId})`;
}

function emptyAudienceResult(chatId) {
  return {
    status: STATUS.NOT_FOUND,
    summary: t('No registered users found to broadcast to.', chatId),
    audience: { count: 0, fingerprint: null },
  };
}

function changedAudienceResult(chatId) {
  return {
    status: STATUS.CHANGED,
    summary: t(
      'The broadcast audience changed while this confirmation was open. Review the recipient count and confirm again.',
      chatId,
    ),
  };
}

function safeAudit(audit, event) {
  if (typeof audit !== 'function') {
    return;
  }

  Promise.resolve(audit(event)).catch((err) =>
    console.error('Admin messaging audit failed:', err),
  );
}

function createAdminMessagingService({
  registry = userRegistryService,
  messenger,
  audit,
} = {}) {
  async function inspectRecipient({ chatId, targetChatId } = {}) {
    const canonicalChatId = normalizeChatId(targetChatId);
    if (!canonicalChatId) {
      return {
        status: STATUS.INVALID_INPUT,
        summary: t('Please choose a registered bot user.', chatId),
      };
    }

    const user = await registry.getUserById(canonicalChatId);
    if (!user) {
      return {
        status: STATUS.NOT_FOUND,
        targetChatId: canonicalChatId,
        summary: t('User {ID} was not found.', chatId, { ID: canonicalChatId }),
      };
    }

    return {
      status: STATUS.OK,
      targetChatId: canonicalChatId,
      recipient: { ...user, chatId: canonicalChatId },
      fingerprint: recipientFingerprint(canonicalChatId),
    };
  }

  async function inspectAudience({ chatId } = {}) {
    const users = normalizeAudience(await registry.listAllUsers());
    if (users.length === 0) {
      return emptyAudienceResult(chatId);
    }

    return {
      status: STATUS.OK,
      audience: {
        count: users.length,
        fingerprint: audienceFingerprint(users),
      },
      users,
    };
  }

  function assertMessenger() {
    if (!messenger || typeof messenger.sendMessage !== 'function') {
      throw new Error(
        'createAdminMessagingService: messenger.sendMessage is required for delivery',
      );
    }
  }

  async function deliverToRecipient({ recipient, message, photoFileId, kind }) {
    assertMessenger();
    const targetChatId = Number(recipient.chatId);
    const prefixKey =
      kind === 'broadcast'
        ? '📢 Broadcast from bot admin:\n\n{MESSAGE}'
        : '📩 Message from bot admin:\n\n{MESSAGE}';

    if (photoFileId) {
      if (typeof messenger.sendPhoto !== 'function') {
        throw new Error(
          'createAdminMessagingService: messenger.sendPhoto is required for photo delivery',
        );
      }
      await messenger.sendPhoto(targetChatId, photoFileId, {
        caption: t(prefixKey, targetChatId, { MESSAGE: message }),
      });

      return { chunks: 1 };
    }

    const messages = splitTextForTelegram({
      recipientChatId: recipient.chatId,
      prefixKey,
      message,
    });
    for (const text of messages) {
      await messenger.sendMessage(targetChatId, text);
    }

    return { chunks: messages.length };
  }

  async function sendDirect({
    actorChatId,
    targetChatId,
    message,
    photoFileId = null,
  } = {}) {
    const inspected = await inspectRecipient({
      chatId: actorChatId,
      targetChatId,
    });
    if (inspected.status !== STATUS.OK) {
      return inspected;
    }

    try {
      const delivery = await deliverToRecipient({
        recipient: inspected.recipient,
        message,
        photoFileId,
        kind: 'direct',
      });
      safeAudit(audit, {
        action: 'send_user_message',
        actorChatId,
        targetChatId: inspected.targetChatId,
        outcome: 'sent',
        chunks: delivery.chunks,
      });

      return {
        status: STATUS.OK,
        recipient: inspected.recipient,
        delivery: { chunks: delivery.chunks },
        summary: t('Message sent to {NAME} ({ID}).', actorChatId, {
          NAME: displayName(inspected.recipient, inspected.targetChatId),
          ID: inspected.targetChatId,
        }),
      };
    } catch (err) {
      safeAudit(audit, {
        action: 'send_user_message',
        actorChatId,
        targetChatId: inspected.targetChatId,
        outcome: 'failed',
      });

      return {
        status: STATUS.FAILED,
        recipient: inspected.recipient,
        summary: t(
          'Unable to deliver the message to {NAME} ({ID}). Please try again.',
          actorChatId,
          {
            NAME: displayName(inspected.recipient, inspected.targetChatId),
            ID: inspected.targetChatId,
          },
        ),
        // Telegram's legacy adapter keeps its existing detailed failure
        // message. Agent adapters must never return this internal value.
        errorMessage: err?.message || 'Unknown delivery error',
      };
    }
  }

  async function broadcast({
    actorChatId,
    message,
    photoFileId = null,
    expectedAudienceFingerprint,
  } = {}) {
    const inspected = await inspectAudience({ chatId: actorChatId });
    if (inspected.status !== STATUS.OK) {
      return inspected;
    }
    if (
      expectedAudienceFingerprint !== undefined &&
      inspected.audience.fingerprint !== expectedAudienceFingerprint
    ) {
      return changedAudienceResult(actorChatId);
    }

    let sent = 0;
    let chunks = 0;
    const failures = [];
    for (const recipient of inspected.users) {
      try {
        const delivery = await deliverToRecipient({
          recipient,
          message,
          photoFileId,
          kind: 'broadcast',
        });
        sent += 1;
        chunks += delivery.chunks;
      } catch (err) {
        console.error(
          `Error sending broadcast to user ${recipient.chatId}:`,
          err,
        );
        failures.push({ recipient, errorMessage: err?.message || 'Unknown delivery error' });
      }
    }

    const failed = failures.length;
    const outcome = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial';
    safeAudit(audit, {
      action: 'broadcast_message',
      actorChatId,
      audienceCount: inspected.audience.count,
      sent,
      failed,
      outcome,
      chunks,
    });

    return {
      status: sent === 0 ? STATUS.FAILED : STATUS.OK,
      audience: inspected.audience,
      delivery: {
        sent,
        failed,
        total: inspected.audience.count,
        chunks,
        failedRecipients: failures
          .slice(0, MAX_FAILURE_DETAILS)
          .map(({ recipient }) => ({
            chatId: recipient.chatId,
            name: displayName(recipient, recipient.chatId),
          })),
      },
      failureLabels: failures.map(({ recipient }) => failureLabel(recipient)),
      summary:
        failed === 0
          ? t(
              'Broadcast completed: delivered to all {TOTAL} registered users.',
              actorChatId,
              { TOTAL: inspected.audience.count },
            )
          : t(
              'Broadcast delivery finished: sent to {SENT} of {TOTAL} registered users; {FAILED} could not be reached.',
              actorChatId,
              {
                SENT: sent,
                TOTAL: inspected.audience.count,
                FAILED: failed,
              },
            ),
    };
  }

  return {
    inspectRecipient,
    inspectAudience,
    sendDirect,
    broadcast,
    buildDirectSummary,
    buildBroadcastSummary,
  };
}

module.exports = {
  STATUS,
  MAX_AGENT_MESSAGE_LENGTH,
  MAX_TELEGRAM_TEXT_LENGTH,
  inspectAgentMessage,
  normalizeAgentMessage,
  buildDirectSummary,
  buildBroadcastSummary,
  splitTextForTelegram,
  audienceFingerprint,
  createAdminMessagingService,
};
