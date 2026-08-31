jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));
jest.mock('../utils/utils', () => ({
  sendLogMessage: jest.fn(),
}));
jest.mock('../adminIdentity', () => ({
  isAdminChatId: jest.fn(),
}));
jest.mock('./identity', () => ({
  getAgentChatId: jest.fn(),
}));
jest.mock('./requestContext', () => ({
  getRequestContext: jest.fn(),
}));
jest.mock('./notifierBot', () => ({
  getNotifierBot: jest.fn(() => ({})),
}));
jest.mock('./wrapToolExecute', () => ({
  wrapToolExecute: jest.fn((_name, execute) => execute),
}));
jest.mock('./writeToolHelpers', () => ({
  defineWriteTool: jest.fn((spec) => spec),
}));

const z = require('zod');
const { isAdminChatId } = require('../adminIdentity');
const { getAgentChatId } = require('./identity');
const { getRequestContext } = require('./requestContext');
const {
  requireAgentAdmin,
  defineAdminReadTool,
  defineAdminWriteTool,
  getRegisteredAdminTools,
  resetAdminToolRegistryForTests,
} = require('./adminAuthorization');

beforeEach(() => {
  jest.clearAllMocks();
  resetAdminToolRegistryForTests();
  getAgentChatId.mockReturnValue(42);
  getRequestContext.mockReturnValue({ email: 'admin@example.com' });
});

test('denies a non-admin with a safe localized envelope', async () => {
  isAdminChatId.mockReturnValue(false);
  const audit = jest.fn();

  await expect(
    requireAgentAdmin({
      chatId: 123,
      toolName: 'get_billing_stats',
      audit,
    }),
  ).resolves.toMatchObject({
    status: 'forbidden',
    tool: 'get_billing_stats',
  });
  expect(audit).toHaveBeenCalledWith({
    chatId: 123,
    toolName: 'get_billing_stats',
    outcome: 'denied',
    status: 'forbidden',
  });
});

test('admin read wrapper derives identity server-side and blocks before execute', async () => {
  isAdminChatId.mockReturnValue(false);
  getAgentChatId.mockReturnValue(123);
  const execute = jest.fn();
  const audit = jest.fn();
  const tool = defineAdminReadTool({
    name: 'list_bot_users',
    description: 'List users.',
    parameters: z.object({
      chatId: z.number().optional(),
      isAdmin: z.boolean().optional(),
    }),
    execute,
    audit,
  });

  const result = await tool.execute({ chatId: 42, isAdmin: true });

  expect(result.status).toBe('forbidden');
  expect(isAdminChatId).toHaveBeenCalledWith(123);
  expect(execute).not.toHaveBeenCalled();
  expect(getRegisteredAdminTools()).toEqual(
    new Map([['list_bot_users', tool]]),
  );
});

test('admin read wrapper executes with the authenticated chatId', async () => {
  isAdminChatId.mockReturnValue(true);
  getAgentChatId.mockReturnValue(42);
  const execute = jest.fn().mockResolvedValue({
    status: 'ok',
    users: [],
  });
  const audit = jest.fn();
  const tool = defineAdminReadTool({
    name: 'list_bot_users',
    description: 'List users.',
    parameters: z.object({ filter: z.string().optional() }),
    execute,
    audit,
  });

  await expect(tool.execute({ filter: 'kilzi' })).resolves.toMatchObject({
    status: 'ok',
  });
  expect(execute).toHaveBeenCalledWith({
    chatId: 42,
    args: { filter: 'kilzi' },
  });
  expect(audit).toHaveBeenCalledWith({
    chatId: 42,
    toolName: 'list_bot_users',
    outcome: 'completed',
    status: 'ok',
  });
});

test('admin write wrapper checks authorization before proposal validation', async () => {
  isAdminChatId.mockReturnValue(false);
  const validate = jest.fn();
  const commit = jest.fn();
  const audit = jest.fn();
  const tool = defineAdminWriteTool({
    name: 'broadcast_message',
    description: 'Broadcast text.',
    parameters: z.object({ message: z.string() }),
    validate,
    buildSummary: () => 'Broadcast.',
    commit,
    audit,
  });

  await expect(
    tool.validate({ chatId: 123, args: { message: 'Hello' } }),
  ).resolves.toMatchObject({ status: 'forbidden' });
  expect(validate).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});

test('admin write wrapper rechecks authorization at commit', async () => {
  isAdminChatId.mockReturnValue(true);
  const commit = jest.fn().mockResolvedValue({ status: 'ok' });
  const audit = jest.fn();
  const tool = defineAdminWriteTool({
    name: 'broadcast_message',
    description: 'Broadcast text.',
    parameters: z.object({ message: z.string() }),
    buildSummary: () => 'Broadcast.',
    commit,
    audit,
  });

  await expect(
    tool.commit({ chatId: 42, args: { message: 'Hello' } }),
  ).resolves.toEqual({ status: 'ok' });
  expect(commit).toHaveBeenCalledWith({
    chatId: 42,
    args: { message: 'Hello' },
  });
  expect(audit).toHaveBeenCalledWith({
    chatId: 42,
    toolName: 'broadcast_message',
    outcome: 'completed',
    status: 'ok',
  });

  isAdminChatId.mockReturnValue(false);
  await expect(
    tool.commit({ chatId: 42, args: { message: 'Again' } }),
  ).resolves.toMatchObject({ status: 'forbidden' });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(getRegisteredAdminTools()).toEqual(
    new Map([['broadcast_message', tool]]),
  );
});
