jest.mock('../services/userProfileSyncService', () => ({ getFreshUserProfile: jest.fn() }));

jest.mock('node-telegram-bot-api', () => jest.fn().mockImplementation(() => ({
  sendMessage: jest.fn().mockResolvedValue(undefined),
})));

const { getNotifierBot, resetNotifierBotForTests } = require('./notifierBot');
const { runWithRequestContext } = require('./requestContext');
const { sendLogMessage, sendErrorMessage } = require('../utils/utils');
const { userCache } = require('../cache');
const { getFreshUserProfile } = require('../services/userProfileSyncService');

const originalToken = process.env.TELEGRAM_BOT_TOKEN;
const originalChatId = process.env.AGENT_HARDCODED_CHAT_ID;

beforeEach(() => {
  getFreshUserProfile.mockReset().mockRejectedValue(new Error('Storage unavailable'));
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  delete process.env.AGENT_HARDCODED_CHAT_ID;
  resetNotifierBotForTests();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  for (const chatId of [42, 43]) {delete userCache[chatId];}
  if (originalToken === undefined) {delete process.env.TELEGRAM_BOT_TOKEN;}
  else {process.env.TELEGRAM_BOT_TOKEN = originalToken;}
  if (originalChatId === undefined) {delete process.env.AGENT_HARDCODED_CHAT_ID;}
  else {process.env.AGENT_HARDCODED_CHAT_ID = originalChatId;}
  resetNotifierBotForTests();
  jest.restoreAllMocks();
});

test.each([
  [{ nickname: 'Kilzid', chatName: 'Doron' }, 'Kilzid'],
  [{ chatName: 'Doron' }, 'Doron'],
  [undefined, '42'],
])('includes the bot display-name fallback in both error channels: %j', async (profile, name) => {
  userCache[42] = profile;
  const bot = getNotifierBot();
  await runWithRequestContext({ chatId: 42 }, () => sendErrorMessage(bot, 'Tool failed'));
  expect(bot.sendMessage).toHaveBeenCalledTimes(2);
  for (const [, message] of bot.sendMessage.mock.calls) {
    expect(message).toContain('AGENT: Tool failed');
    expect(message).toContain(name === '42' ? 'user: 42\nenv:' : `user: ${name} (42)`);
  }
});

test('shared notifier resolves each concurrent request independently', async () => {
  getFreshUserProfile.mockImplementation(async (chatId) => {
    await new Promise((resolve) => setImmediate(resolve));

    return { nickname: chatId === 42 ? 'First' : 'Second' };
  });
  const bot = getNotifierBot();
  await Promise.all([42, 43].map((chatId) => runWithRequestContext({ chatId }, async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await sendLogMessage(bot, `Request ${chatId}`);
  })));
  const messages = bot.sendMessage.mock.calls.map(([, message]) => message);
  expect(messages.find((message) => message.includes('Request 42'))).toContain('user: First (42)');
  expect(messages.find((message) => message.includes('Request 43'))).toContain('user: Second (43)');
});

test('background logs work without identity', async () => {
  const bot = getNotifierBot();
  await sendLogMessage(bot, 'Starting');
  expect(bot.sendMessage.mock.calls[0][1]).not.toContain('user:');
});

test('local noop notifier uses the configured identity', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  process.env.AGENT_HARDCODED_CHAT_ID = '42';
  userCache[42] = { nickname: 'Local' };
  await sendLogMessage(getNotifierBot(), 'Usage');
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('user: Local (42)'));
});

test('ordinary Telegram bot logs keep their existing format', async () => {
  const bot = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  await runWithRequestContext({ chatId: 42 }, () => sendLogMessage(bot, 'Bot message'));
  expect(bot.sendMessage.mock.calls[0][1]).toContain('BOT: Bot message');
  expect(bot.sendMessage.mock.calls[0][1]).not.toContain('user:');
});

test('loads the saved nickname on a cold cache and reuses it within the request', async () => {
  getFreshUserProfile.mockResolvedValue({ nickname: 'Saved nickname', chatName: 'Name' });
  const bot = getNotifierBot();
  await runWithRequestContext({ chatId: 42 }, async () => {
    await sendLogMessage(bot, 'First usage');
    await sendErrorMessage(bot, 'Error');
  });
  expect(getFreshUserProfile).toHaveBeenCalledTimes(1);
  expect(getFreshUserProfile).toHaveBeenCalledWith(42);
  for (const [, message] of bot.sendMessage.mock.calls) {
    expect(message).toContain('user: Saved nickname (42)');
  }
});

test('refreshes stale nicknames on the next request and handles nickname removal', async () => {
  userCache[42] = { nickname: 'Old nickname' };
  getFreshUserProfile.mockResolvedValueOnce({ nickname: 'New nickname' }).mockResolvedValueOnce({});
  const bot = getNotifierBot();
  await runWithRequestContext({ chatId: 42 }, () => sendLogMessage(bot, 'First'));
  await runWithRequestContext({ chatId: 42 }, () => sendLogMessage(bot, 'Second'));
  expect(bot.sendMessage.mock.calls[0][1]).toContain('user: New nickname (42)');
  expect(bot.sendMessage.mock.calls[1][1]).toContain('user: 42\nenv:');
});
