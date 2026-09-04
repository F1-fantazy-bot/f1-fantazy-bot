const z = require('zod');
const {
  createAdminAccessService,
  STATUS,
} = require('../../services/adminAccessService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  defineAdminWriteTool,
} = require('../adminAuthorization');
const {
  WRITE_RESULT_STATUSES,
} = require('../writeToolHelpers');

const chatId = z.string().trim().min(1).max(80);
const email = z.string().trim().min(3).max(320);
const nickname = z.string().trim().min(1).max(160);

function createAgentAdminAccessService() {
  return createAdminAccessService();
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

function staleResult(result, tool) {
  if (result.status !== STATUS.CHANGED) {
    return result;
  }

  return {
    ...result,
    tool,
    status: WRITE_RESULT_STATUSES.INVALID_INPUT,
  };
}

const setUserNicknameTool = defineAdminWriteTool({
  name: 'set_user_nickname',
  description:
    'Admin only. Set the nickname shown for one registered Telegram bot user. Requires the exact canonical chatId selected from list_bot_users and a non-empty nickname. Always requires confirmation.',
  parameters: z.object({ chatId, nickname }),
  validate: async ({ chatId: actorChatId, args }) => {
    await getFreshLanguagePreference(actorChatId);
    const service = createAgentAdminAccessService();
    const inspected = await service.inspectNickname({
      chatId: actorChatId,
      targetChatId: args.chatId,
      nickname: args.nickname,
    });
    if (inspected.status !== STATUS.OK) {
      return validationStatus(inspected, 'set_user_nickname');
    }
    if (!inspected.changed) {
      return {
        ...inspected,
        status: WRITE_RESULT_STATUSES.OK,
        tool: 'set_user_nickname',
        summary: service.nicknameNoopSummary({
          chatId: actorChatId,
          inspected,
        }),
      };
    }

    return {
      args: {
        chatId: inspected.targetChatId,
        nickname: inspected.nickname,
      },
      intentArgs: {
        targetChatId: inspected.targetChatId,
        nickname: inspected.nickname,
        expectedNickname: inspected.currentNickname,
      },
      summary: service.nicknameSummary({
        chatId: actorChatId,
        inspected,
      }),
    };
  },
  buildSummary: ({ args }) =>
    `Set the nickname for ${args.chatId} to "${args.nickname}".`,
  commit: async ({ chatId: actorChatId, args }) => {
    const result = await createAgentAdminAccessService().setUserNickname({
      chatId: actorChatId,
      ...args,
    });

    return staleResult({ ...result, tool: 'set_user_nickname' }, 'set_user_nickname');
  },
});

const allowWebUserTool = defineAdminWriteTool({
  name: 'allow_web_user',
  description:
    'Admin only. Allow a normalized Google email to use the web agent as one exact registered Telegram user. Use list_bot_users for a guided target choice. Always requires confirmation.',
  parameters: z.object({ email, chatId }),
  validate: async ({ chatId: actorChatId, args }) => {
    await getFreshLanguagePreference(actorChatId);
    const service = createAgentAdminAccessService();
    const inspected = await service.inspectWebUserAllowance({
      chatId: actorChatId,
      email: args.email,
      targetChatId: args.chatId,
    });
    if (inspected.status !== STATUS.OK) {
      return validationStatus(inspected, 'allow_web_user');
    }
    if (!inspected.changed) {
      return {
        ...inspected,
        status: WRITE_RESULT_STATUSES.OK,
        tool: 'allow_web_user',
        summary: service.allowNoopSummary({
          chatId: actorChatId,
          inspected,
        }),
      };
    }

    return {
      args: { email: inspected.email, chatId: inspected.targetChatId },
      intentArgs: {
        email: inspected.email,
        targetChatId: inspected.targetChatId,
        expectedExistingChatId: inspected.existing
          ? String(inspected.existing.chatId || '')
          : null,
      },
      summary: service.allowSummary({ chatId: actorChatId, inspected }),
    };
  },
  buildSummary: ({ args }) =>
    `Allow ${args.email} to use the web agent as ${args.chatId}.`,
  commit: async ({ chatId: actorChatId, args }) => {
    const result = await createAgentAdminAccessService().allowWebUser({
      chatId: actorChatId,
      ...args,
    });

    return staleResult({ ...result, tool: 'allow_web_user' }, 'allow_web_user');
  },
});

const revokeWebUserTool = defineAdminWriteTool({
  name: 'revoke_web_user',
  description:
    'Admin only. Revoke one exact normalized Google email from the web-agent allowlist. Use list_web_users for a guided target choice when the email was not supplied. Always requires confirmation.',
  parameters: z.object({ email }),
  validate: async ({ chatId: actorChatId, args }) => {
    await getFreshLanguagePreference(actorChatId);
    const service = createAgentAdminAccessService();
    const inspected = await service.inspectWebUserRevocation({
      chatId: actorChatId,
      email: args.email,
    });
    if (inspected.status !== STATUS.OK) {
      return validationStatus(inspected, 'revoke_web_user');
    }

    return {
      args: { email: inspected.email },
      intentArgs: {
        email: inspected.email,
        expectedExistingChatId: String(inspected.existing.chatId || ''),
      },
      summary: `Revoke ${inspected.email} from the web-agent allowlist.`,
    };
  },
  buildSummary: ({ args }) =>
    `Revoke ${args.email} from the web-agent allowlist.`,
  commit: async ({ chatId: actorChatId, args }) => {
    const result = await createAgentAdminAccessService().revokeWebUser({
      chatId: actorChatId,
      ...args,
    });

    return staleResult({ ...result, tool: 'revoke_web_user' }, 'revoke_web_user');
  },
});

module.exports = {
  createAgentAdminAccessService,
  setUserNicknameTool,
  allowWebUserTool,
  revokeWebUserTool,
};
