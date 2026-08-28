const { t } = require('../i18n');

const MAX_BUG_REPORT_LENGTH = 4000;
const MAX_OUTBOUND_MESSAGE_LENGTH = 4000;
const REPORT_LIMIT = 3;
const REPORT_WINDOW_MS = 60 * 60 * 1000;

const reportTimestampsByChat = new Map();

const STATUS = Object.freeze({
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
  FORBIDDEN: 'forbidden',
  FAILED: 'failed',
});

function normalizeMessage(message) {
  return typeof message === 'string' ? message.trim() : '';
}

function activeReportTimestamps(chatId, nowMs) {
  const key = String(chatId);
  const cutoff = nowMs - REPORT_WINDOW_MS;
  const active = (reportTimestampsByChat.get(key) || []).filter(
    (timestamp) => timestamp > cutoff,
  );

  if (active.length === 0) {
    reportTimestampsByChat.delete(key);
  } else {
    reportTimestampsByChat.set(key, active);
  }

  return active;
}

function invalidInputResult(chatId, message) {
  const summary = message
    ? t(
        'Bug reports can contain at most {MAX} characters.',
        chatId,
        { MAX: MAX_BUG_REPORT_LENGTH },
      )
    : t('Please enter a bug report or feedback message.', chatId);

  return {
    status: STATUS.INVALID_INPUT,
    summary,
    maxLength: MAX_BUG_REPORT_LENGTH,
  };
}

function forbiddenResult(chatId) {
  return {
    status: STATUS.FORBIDDEN,
    summary: t(
      'You can send up to {MAX} bug reports per hour. Please try again later.',
      chatId,
      { MAX: REPORT_LIMIT },
    ),
    limit: REPORT_LIMIT,
    windowMs: REPORT_WINDOW_MS,
  };
}

function inspectBugReport({ chatId, message, nowMs = Date.now() }) {
  const normalizedMessage = normalizeMessage(message);
  if (
    !normalizedMessage ||
    normalizedMessage.length > MAX_BUG_REPORT_LENGTH
  ) {
    return invalidInputResult(chatId, normalizedMessage);
  }

  if (activeReportTimestamps(chatId, nowMs).length >= REPORT_LIMIT) {
    return forbiddenResult(chatId);
  }

  return {
    status: STATUS.OK,
    message: normalizedMessage,
  };
}

function reserveReportSlot(chatId, nowMs) {
  const active = activeReportTimestamps(chatId, nowMs);
  if (active.length >= REPORT_LIMIT) {
    return false;
  }

  reportTimestampsByChat.set(String(chatId), [...active, nowMs]);

  return true;
}

function buildAdminMessagePrefix({
  chatId,
  source,
  email,
  chatName,
  displayName,
}) {
  const safeDisplayName = displayName || String(chatId);
  const safeChatName = chatName || safeDisplayName;
  const header = t(
    'Bug report from {DISPLAY_NAME} ({NAME}, {ID}):',
    chatId,
    {
      DISPLAY_NAME: safeDisplayName,
      NAME: safeChatName,
      ID: chatId,
    },
  );
  const metadata = [`Source: ${source}`];
  if (email) {
    metadata.push(`Email: ${email}`);
  }

  return `${header}\n${metadata.join('\n')}`;
}

function buildAdminMessages(args) {
  const prefix = buildAdminMessagePrefix(args);
  const singleMessage = `${prefix}\n\n${args.message}`;
  if (singleMessage.length <= MAX_OUTBOUND_MESSAGE_LENGTH) {
    return [singleMessage];
  }

  const partLineReserve = '\nPart 99/99'.length;
  const chunkSize =
    MAX_OUTBOUND_MESSAGE_LENGTH - prefix.length - partLineReserve - 2;
  const parts = [];
  for (let offset = 0; offset < args.message.length; offset += chunkSize) {
    parts.push(args.message.slice(offset, offset + chunkSize));
  }

  return parts.map(
    (part, index) =>
      `${prefix}\nPart ${index + 1}/${parts.length}\n\n${part}`,
  );
}

function releaseReportSlot(chatId, timestamp) {
  const key = String(chatId);
  const timestamps = reportTimestampsByChat.get(key) || [];
  const index = timestamps.indexOf(timestamp);
  if (index < 0) {
    return;
  }

  const next = [...timestamps];
  next.splice(index, 1);
  if (next.length === 0) {
    reportTimestampsByChat.delete(key);
  } else {
    reportTimestampsByChat.set(key, next);
  }
}

function createReportBugService({ messenger, now = () => Date.now() }) {
  if (
    !messenger ||
    typeof messenger.sendToAdmins !== 'function' ||
    typeof messenger.sendToBugsGroup !== 'function'
  ) {
    throw new Error(
      'createReportBugService: messenger must provide sendToAdmins and sendToBugsGroup',
    );
  }

  function inspect({ chatId, message }) {
    return inspectBugReport({ chatId, message, nowMs: now() });
  }

  async function report({
    chatId,
    message,
    source,
    email,
    chatName,
    displayName,
  }) {
    const inspected = inspect({ chatId, message });
    if (inspected.status !== STATUS.OK) {
      return inspected;
    }

    const nowMs = now();
    if (!reserveReportSlot(chatId, nowMs)) {
      return forbiddenResult(chatId);
    }

    const normalizedSource =
      source === 'telegram' ? 'telegram' : 'web-agent';
    const adminMessages = buildAdminMessages({
      chatId,
      message: inspected.message,
      source: normalizedSource,
      email,
      chatName,
      displayName,
    });

    try {
      for (const adminMessage of adminMessages) {
        await messenger.sendToAdmins(adminMessage);
        await messenger.sendToBugsGroup(adminMessage);
      }
    } catch (err) {
      releaseReportSlot(chatId, nowMs);
      console.error('Error delivering bug report:', err);

      return {
        status: STATUS.FAILED,
        summary: t(
          'Unable to send your report right now. Please try again.',
          chatId,
        ),
      };
    }

    return {
      status: STATUS.OK,
      summary: t(
        'Your message has been sent to the admins. Thank you!',
        chatId,
      ),
    };
  }

  return { inspect, report };
}

function resetReportBugRateLimitsForTests() {
  reportTimestampsByChat.clear();
}

module.exports = {
  createReportBugService,
  inspectBugReport,
  buildAdminMessages,
  resetReportBugRateLimitsForTests,
  MAX_BUG_REPORT_LENGTH,
  MAX_OUTBOUND_MESSAGE_LENGTH,
  REPORT_LIMIT,
  REPORT_WINDOW_MS,
  STATUS,
};
