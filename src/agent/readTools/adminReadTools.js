const z = require('zod');
const { USER_COMMANDS_CONFIG } = require('../../constants');
const { getMonthlyBillingStats } = require('../../azureBillingService');
const { listAllUsers } = require('../../userRegistryService');
const { listAllowedUsers } = require('../../webUserAllowlistService');
const {
  buildBillingView,
  buildBotfatherSetup,
  buildBotUserDirectory,
  buildVersionInfo,
  buildWebUserDirectory,
} = require('../../cores/adminReadCore');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { normalizeEmail } = require('../../services/adminAccessService');
const { defineAdminReadTool } = require('../adminAuthorization');

async function withAdminLanguage(chatId, result) {
  const { lang } = await getFreshLanguagePreference(chatId);

  return { ...result, lang };
}

const getAdminVersionTool = defineAdminReadTool({
  name: 'get_admin_version',
  description:
    'Admin only. Get the currently deployed commit ID, commit message, and commit link. Takes no arguments.',
  parameters: z.object({}),
  execute: async ({ chatId }) =>
    await withAdminLanguage(chatId, {
      status: 'ok',
      version: buildVersionInfo(process.env),
    }),
});

const getBillingStatsTool = defineAdminReadTool({
  name: 'get_billing_stats',
  description:
    'Admin only. Get safe, bounded Azure billing totals for the current and previous month, with service-cost breakdowns. Takes no arguments.',
  parameters: z.object({}),
  execute: async ({ chatId }) => {
    const billingData = await getMonthlyBillingStats();

    return await withAdminLanguage(chatId, {
      status: 'ok',
      billing: buildBillingView(billingData),
    });
  },
});

const botUserParameters = z
  .object({
    selectionMode: z
      .enum([
        'set_user_nickname',
        'allow_web_user',
        'send_user_message',
      ])
      .optional(),
    nickname: z.string().trim().min(1).max(160).optional(),
    email: z.string().trim().min(3).max(320).optional(),
    message: z.string().optional(),
  })
  .superRefine((args, context) => {
    if (args.nickname && args.selectionMode !== 'set_user_nickname') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'nickname requires set_user_nickname selectionMode',
      });
    }
    if (args.email && args.selectionMode !== 'allow_web_user') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'email requires allow_web_user selectionMode',
      });
    }
    if (args.message && args.selectionMode !== 'send_user_message') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'message requires send_user_message selectionMode',
      });
    }
  });

const listWebUserParameters = z.object({
  selectionMode: z.enum(['revoke_web_user']).optional(),
});

const listBotUsersTool = defineAdminReadTool({
  name: 'list_bot_users',
  description:
    'Admin only. List registered Telegram bot users, newest activity first. The result is capped to a safe maximum and reports if more users exist. Use selectionMode="set_user_nickname", "allow_web_user", or "send_user_message" only to show canonical clickable target choices for that confirmed admin write.',
  parameters: botUserParameters,
  execute: async ({ chatId, args }) => {
    const users = await listAllUsers();

    return await withAdminLanguage(chatId, {
      status: 'ok',
      directory: buildBotUserDirectory(users),
      selection: args.selectionMode
        ? {
          mode: args.selectionMode,
          nickname: args.nickname || null,
          email: args.email ? normalizeEmail(args.email) : null,
          message: args.message || null,
        }
        : null,
    });
  },
});

const listWebUsersTool = defineAdminReadTool({
  name: 'list_web_users',
  description:
    'Admin only. List Google accounts allowed to use the web agent, joined with their Telegram display name when available. The result is capped to a safe maximum. Use selectionMode="revoke_web_user" only to show canonical clickable revocation choices.',
  parameters: listWebUserParameters,
  execute: async ({ chatId, args }) => {
    const [allowedUsers, registryUsers] = await Promise.all([
      listAllowedUsers(),
      // The linked display name is helpful but non-authoritative. Keep the
      // allowlist readable if the secondary user-registry lookup is down.
      listAllUsers().catch(() => []),
    ]);

    return await withAdminLanguage(chatId, {
      status: 'ok',
      directory: buildWebUserDirectory(allowedUsers, registryUsers),
      selection: args.selectionMode
        ? { mode: args.selectionMode }
        : null,
    });
  },
});

const getBotfatherSetupTool = defineAdminReadTool({
  name: 'get_botfather_setup',
  description:
    'Admin only. Show the current BotFather user-command configuration as a copyable command and description list. Takes no arguments.',
  parameters: z.object({}),
  execute: async ({ chatId }) =>
    await withAdminLanguage(chatId, {
      status: 'ok',
      setup: buildBotfatherSetup(USER_COMMANDS_CONFIG),
    }),
});

module.exports = {
  withAdminLanguage,
  getAdminVersionTool,
  getBillingStatsTool,
  listBotUsersTool,
  listWebUsersTool,
  getBotfatherSetupTool,
  botUserParameters,
  listWebUserParameters,
};
