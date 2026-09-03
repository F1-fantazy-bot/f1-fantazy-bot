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

const listBotUsersTool = defineAdminReadTool({
  name: 'list_bot_users',
  description:
    'Admin only. List registered Telegram bot users, newest activity first. The result is capped to a safe maximum and reports if more users exist. Takes no arguments.',
  parameters: z.object({}),
  execute: async ({ chatId }) => {
    const users = await listAllUsers();

    return await withAdminLanguage(chatId, {
      status: 'ok',
      directory: buildBotUserDirectory(users),
    });
  },
});

const listWebUsersTool = defineAdminReadTool({
  name: 'list_web_users',
  description:
    'Admin only. List Google accounts allowed to use the web agent, joined with their Telegram display name when available. The result is capped to a safe maximum. Takes no arguments.',
  parameters: z.object({}),
  execute: async ({ chatId }) => {
    const [allowedUsers, registryUsers] = await Promise.all([
      listAllowedUsers(),
      // The linked display name is helpful but non-authoritative. Keep the
      // allowlist readable if the secondary user-registry lookup is down.
      listAllUsers().catch(() => []),
    ]);

    return await withAdminLanguage(chatId, {
      status: 'ok',
      directory: buildWebUserDirectory(allowedUsers, registryUsers),
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
};
