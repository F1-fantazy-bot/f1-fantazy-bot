jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: (spec) => spec,
}));
jest.mock('../../adminIdentity', () => ({ isAdminChatId: jest.fn() }));
jest.mock('../identity', () => ({ getAgentChatId: jest.fn() }));
jest.mock('../requestContext', () => ({ getRequestContext: jest.fn() }));
jest.mock('../notifierBot', () => ({ getNotifierBot: jest.fn(() => ({})) }));
jest.mock('../wrapToolExecute', () => ({
  wrapToolExecute: (_name, execute) => execute,
}));
jest.mock('../writeToolHelpers', () => ({
  defineWriteTool: (spec) => spec,
}));
jest.mock('../../utils/utils', () => ({ sendLogMessage: jest.fn() }));
jest.mock('../../azureBillingService', () => ({
  getMonthlyBillingStats: jest.fn(),
}));
jest.mock('../../userRegistryService', () => ({ listAllUsers: jest.fn() }));
jest.mock('../../webUserAllowlistService', () => ({
  listAllowedUsers: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));

const { isAdminChatId } = require('../../adminIdentity');
const { getAgentChatId } = require('../identity');
const { getMonthlyBillingStats } = require('../../azureBillingService');
const { listAllUsers } = require('../../userRegistryService');
const { listAllowedUsers } = require('../../webUserAllowlistService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  getAdminVersionTool,
  getBillingStatsTool,
  listBotUsersTool,
  listWebUsersTool,
  getBotfatherSetupTool,
} = require('./adminReadTools');

beforeEach(() => {
  jest.clearAllMocks();
  getAgentChatId.mockReturnValue(42);
  isAdminChatId.mockReturnValue(true);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'he' });
});

test('blocks every Phase 10 admin read before any backend access', async () => {
  isAdminChatId.mockReturnValue(false);

  const results = await Promise.all([
    getAdminVersionTool.execute({}),
    getBillingStatsTool.execute({}),
    listBotUsersTool.execute({}),
    listWebUsersTool.execute({}),
    getBotfatherSetupTool.execute({}),
  ]);

  expect(results).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'forbidden', tool: 'get_admin_version' }),
    expect.objectContaining({ status: 'forbidden', tool: 'get_billing_stats' }),
    expect.objectContaining({ status: 'forbidden', tool: 'list_bot_users' }),
    expect.objectContaining({ status: 'forbidden', tool: 'list_web_users' }),
    expect.objectContaining({ status: 'forbidden', tool: 'get_botfather_setup' }),
  ]));
  expect(getMonthlyBillingStats).not.toHaveBeenCalled();
  expect(listAllUsers).not.toHaveBeenCalled();
  expect(listAllowedUsers).not.toHaveBeenCalled();
  expect(getFreshLanguagePreference).not.toHaveBeenCalled();
});

test('returns bounded, localized safe models for each authenticated admin read', async () => {
  getMonthlyBillingStats.mockResolvedValue({
    currentMonth: {
      hasData: true,
      totalCost: 12.5,
      period: { monthName: 'September', year: 2026 },
      serviceBreakdown: [{ serviceName: 'Functions', cost: 12.5, currency: 'USD' }],
    },
    previousMonth: { hasData: false, totalCost: 0, serviceBreakdown: [], period: {} },
  });
  listAllUsers.mockResolvedValue([
    {
      chatId: '7',
      chatName: 'Pole position',
      nickname: 'Pole',
      lang: 'he',
      lastSeen: '2026-09-01T08:00:00.000Z',
    },
  ]);
  listAllowedUsers.mockResolvedValue([
    {
      email: 'admin@example.com',
      chatId: '7',
      addedAt: '2026-09-01T08:00:00.000Z',
      addedBy: '42',
    },
  ]);

  await expect(getAdminVersionTool.execute({})).resolves.toMatchObject({
    status: 'ok',
    lang: 'he',
    version: { commitId: expect.any(String) },
  });
  await expect(getBillingStatsTool.execute({})).resolves.toMatchObject({
    status: 'ok',
    lang: 'he',
    billing: { currentMonth: { totalCost: 12.5 } },
  });
  await expect(listBotUsersTool.execute({})).resolves.toMatchObject({
    status: 'ok',
    directory: { users: [{ chatId: '7', nickname: 'Pole' }] },
  });
  await expect(listWebUsersTool.execute({})).resolves.toMatchObject({
    status: 'ok',
    directory: {
      users: [{ email: 'admin@example.com', linkedDisplay: 'Pole' }],
    },
  });
  await expect(getBotfatherSetupTool.execute({})).resolves.toMatchObject({
    status: 'ok',
    setup: {
      commands: expect.arrayContaining([
        expect.objectContaining({ command: expect.any(String) }),
      ]),
    },
  });
});

test('still lists allowlisted web users when only the linked directory lookup fails', async () => {
  listAllowedUsers.mockResolvedValue([
    { email: 'linked@example.com', chatId: '999' },
  ]);
  listAllUsers.mockRejectedValue(new Error('registry unavailable'));

  await expect(listWebUsersTool.execute({})).resolves.toMatchObject({
    status: 'ok',
    directory: {
      users: [{ email: 'linked@example.com', chatId: '999', linkedDisplay: null }],
    },
  });
});

test('returns only current bounded directory rows as canonical guided write targets', async () => {
  listAllUsers.mockResolvedValue([
    { chatId: '7', chatName: 'Fast Driver', lastSeen: '2026-09-01T08:00:00.000Z' },
  ]);
  listAllowedUsers.mockResolvedValue([
    { email: 'admin@example.com', chatId: '7' },
  ]);

  await expect(
    listBotUsersTool.execute({
      selectionMode: 'allow_web_user',
      email: 'Admin@Example.COM',
    }),
  ).resolves.toMatchObject({
    status: 'ok',
    selection: { mode: 'allow_web_user', email: 'admin@example.com' },
    directory: { users: [{ chatId: '7' }] },
  });
  await expect(
    listWebUsersTool.execute({ selectionMode: 'revoke_web_user' }),
  ).resolves.toMatchObject({
    status: 'ok',
    selection: { mode: 'revoke_web_user' },
    directory: { users: [{ email: 'admin@example.com' }] },
  });
});
