// Shared admin identity/access mutations.
//
// Telegram's pending-reply flows and the confirmed web-agent tools both use
// this service. It owns normalization, fresh target checks, no-op detection,
// and the persistence/cache publication boundary; surfaces keep their own
// prompts and transport-specific error handling.

const userRegistryService = require('../userRegistryService');
const webUserAllowlistService = require('../webUserAllowlistService');
const { userCache } = require('../cache');
const { t } = require('../i18n');

const STATUS = Object.freeze({
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
  NOT_FOUND: 'not_found',
  CHANGED: 'changed',
});

// Intentionally the same permissive preflight as the Telegram command. The
// identity provider remains the source of truth for Google-account validity.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

function normalizeChatId(chatId) {
  return typeof chatId === 'string' || typeof chatId === 'number'
    ? String(chatId).trim()
    : '';
}

function normalizeNickname(nickname) {
  return typeof nickname === 'string' ? nickname.trim() : '';
}

function displayName(user, fallback) {
  return user?.nickname || user?.chatName || fallback;
}

function unchangedTargetResult(chatId) {
  return {
    status: STATUS.CHANGED,
    summary: t(
      'The target changed while this confirmation was open. Review the details and confirm again.',
      chatId,
    ),
  };
}

function createAdminAccessService({
  registry = userRegistryService,
  allowlist = webUserAllowlistService,
  cache = userCache,
} = {}) {
  async function inspectNickname({ chatId, targetChatId, nickname } = {}) {
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

    const canonicalNickname = normalizeNickname(nickname);
    if (nickname !== undefined && !canonicalNickname) {
      return {
        status: STATUS.INVALID_INPUT,
        targetChatId: canonicalChatId,
        user,
        summary: t('Please enter a nickname.', chatId),
      };
    }

    const currentNickname = normalizeNickname(user.nickname);
    const changed =
      nickname === undefined ? null : currentNickname !== canonicalNickname;

    return {
      status: STATUS.OK,
      targetChatId: canonicalChatId,
      user,
      nickname: canonicalNickname,
      currentNickname,
      changed,
    };
  }

  function nicknameSummary({ chatId, inspected, final = false }) {
    const name = displayName(inspected.user, inspected.targetChatId);
    const key = final
      ? 'Nickname for {NAME} ({ID}) set to "{NICKNAME}".'
      : 'Set the nickname for {NAME} ({ID}) to "{NICKNAME}".';

    return t(key, chatId, {
      NAME: name,
      ID: inspected.targetChatId,
      NICKNAME: inspected.nickname,
    });
  }

  function nicknameNoopSummary({ chatId, inspected }) {
    return t(
      'Nickname for {NAME} ({ID}) is already "{NICKNAME}".',
      chatId,
      {
        NAME: displayName(inspected.user, inspected.targetChatId),
        ID: inspected.targetChatId,
        NICKNAME: inspected.nickname,
      },
    );
  }

  async function setUserNickname({
    chatId,
    targetChatId,
    nickname,
    expectedNickname,
  } = {}) {
    const inspected = await inspectNickname({ chatId, targetChatId, nickname });
    if (inspected.status !== STATUS.OK) {
      return inspected;
    }

    if (
      expectedNickname !== undefined &&
      inspected.currentNickname !== normalizeNickname(expectedNickname)
    ) {
      return unchangedTargetResult(chatId);
    }

    if (!inspected.changed) {
      return {
        ...inspected,
        summary: nicknameNoopSummary({ chatId, inspected }),
      };
    }

    try {
      await registry.updateUserAttributes(inspected.targetChatId, {
        nickname: inspected.nickname,
      });
    } catch (err) {
      err.adminAccessOperation = 'set_nickname';
      throw err;
    }

    const cacheKey = String(inspected.targetChatId);
    if (!cache[cacheKey]) {
      cache[cacheKey] = {};
    }
    cache[cacheKey].nickname = inspected.nickname;

    return {
      ...inspected,
      summary: nicknameSummary({ chatId, inspected, final: true }),
    };
  }

  async function inspectWebUserAllowance({ chatId, email, targetChatId } = {}) {
    const canonicalEmail = normalizeEmail(email);
    if (!isValidEmail(canonicalEmail)) {
      return {
        status: STATUS.INVALID_INPUT,
        summary: t('Please enter a valid Google email address.', chatId),
      };
    }

    const canonicalChatId = normalizeChatId(targetChatId);
    if (!canonicalChatId) {
      return {
        status: STATUS.INVALID_INPUT,
        email: canonicalEmail,
        summary: t('Please choose a registered bot user.', chatId),
      };
    }

    const user = await registry.getUserById(canonicalChatId);
    if (!user) {
      return {
        status: STATUS.NOT_FOUND,
        email: canonicalEmail,
        targetChatId: canonicalChatId,
        summary: t('User {ID} was not found.', chatId, { ID: canonicalChatId }),
      };
    }

    const existing = await allowlist.getAllowedUserByEmail(canonicalEmail);
    const changed = String(existing?.chatId || '') !== canonicalChatId;

    return {
      status: STATUS.OK,
      email: canonicalEmail,
      targetChatId: canonicalChatId,
      user,
      existing: existing || null,
      changed,
    };
  }

  function allowSummary({ chatId, inspected, final = false }) {
    const key = final
      ? '✅ Allowed {EMAIL} on the web agent, mapped to {NAME} ({ID}).'
      : 'Allow {EMAIL} on the web agent, mapped to {NAME} ({ID}).';

    return t(key, chatId, {
      EMAIL: inspected.email,
      NAME: displayName(inspected.user, inspected.targetChatId),
      ID: inspected.targetChatId,
    });
  }

  function allowNoopSummary({ chatId, inspected }) {
    return t(
      '{EMAIL} is already allowed on the web agent for {NAME} ({ID}).',
      chatId,
      {
        EMAIL: inspected.email,
        NAME: displayName(inspected.user, inspected.targetChatId),
        ID: inspected.targetChatId,
      },
    );
  }

  async function allowWebUser({
    chatId,
    email,
    targetChatId,
    expectedExistingChatId,
  } = {}) {
    const inspected = await inspectWebUserAllowance({
      chatId,
      email,
      targetChatId,
    });
    if (inspected.status !== STATUS.OK) {
      return inspected;
    }

    const currentExistingChatId = inspected.existing
      ? String(inspected.existing.chatId || '')
      : null;
    if (
      expectedExistingChatId !== undefined &&
      currentExistingChatId !== expectedExistingChatId
    ) {
      return unchangedTargetResult(chatId);
    }

    if (!inspected.changed) {
      return {
        ...inspected,
        summary: allowNoopSummary({ chatId, inspected }),
      };
    }

    try {
      await allowlist.addAllowedUser(
        inspected.email,
        inspected.targetChatId,
        chatId,
      );
    } catch (err) {
      err.adminAccessOperation = 'allow_web_user';
      throw err;
    }

    return {
      ...inspected,
      summary: allowSummary({ chatId, inspected, final: true }),
    };
  }

  async function inspectWebUserRevocation({ chatId, email } = {}) {
    const canonicalEmail = normalizeEmail(email);
    if (!isValidEmail(canonicalEmail)) {
      return {
        status: STATUS.INVALID_INPUT,
        summary: t('Please enter a valid Google email address.', chatId),
      };
    }

    const existing = await allowlist.getAllowedUserByEmail(canonicalEmail);
    if (!existing) {
      return {
        status: STATUS.NOT_FOUND,
        email: canonicalEmail,
        summary: t(
          '{EMAIL} was not on the web allowlist — nothing to do.',
          chatId,
          { EMAIL: canonicalEmail },
        ),
      };
    }

    return {
      status: STATUS.OK,
      email: canonicalEmail,
      existing,
      changed: true,
    };
  }

  async function revokeWebUser({ chatId, email, expectedExistingChatId } = {}) {
    const inspected = await inspectWebUserRevocation({ chatId, email });
    if (inspected.status !== STATUS.OK) {
      return inspected;
    }

    const currentExistingChatId = String(inspected.existing.chatId || '');
    if (
      expectedExistingChatId !== undefined &&
      currentExistingChatId !== expectedExistingChatId
    ) {
      return unchangedTargetResult(chatId);
    }

    try {
      await allowlist.removeAllowedUser(inspected.email);
    } catch (err) {
      err.adminAccessOperation = 'revoke_web_user';
      throw err;
    }

    return {
      ...inspected,
      summary: t('🚫 Revoked {EMAIL} from the web agent allowlist.', chatId, {
        EMAIL: inspected.email,
      }),
    };
  }

  return {
    inspectNickname,
    nicknameSummary,
    nicknameNoopSummary,
    setUserNickname,
    inspectWebUserAllowance,
    allowSummary,
    allowNoopSummary,
    allowWebUser,
    inspectWebUserRevocation,
    revokeWebUser,
  };
}

module.exports = {
  STATUS,
  EMAIL_REGEX,
  normalizeEmail,
  isValidEmail,
  normalizeChatId,
  normalizeNickname,
  displayName,
  createAdminAccessService,
};
