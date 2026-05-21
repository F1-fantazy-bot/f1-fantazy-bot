const { runWithRequestContext } = require('./requestContext');
const { getAgentChatId } = require('./identity');

describe('getAgentChatId', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('returns the chatId from the active request context', async () => {
    process.env.AGENT_HARDCODED_CHAT_ID = '999';

    await runWithRequestContext({ chatId: 42, email: 'a@b.com' }, async () => {
      expect(getAgentChatId()).toBe(42);
    });
  });

  test('falls back to AGENT_HARDCODED_CHAT_ID when no context is active', () => {
    process.env.AGENT_HARDCODED_CHAT_ID = '7654321';

    expect(getAgentChatId()).toBe(7654321);
  });

  test('ignores context.chatId that is not a finite number', async () => {
    process.env.AGENT_HARDCODED_CHAT_ID = '7654321';

    await runWithRequestContext({ chatId: 'not-a-number' }, async () => {
      expect(getAgentChatId()).toBe(7654321);
    });
  });

  test('throws when neither context nor env is available', () => {
    delete process.env.AGENT_HARDCODED_CHAT_ID;

    expect(() => getAgentChatId()).toThrow(/AGENT_HARDCODED_CHAT_ID/);
  });

  test('throws when AGENT_HARDCODED_CHAT_ID is non-numeric and no context', () => {
    process.env.AGENT_HARDCODED_CHAT_ID = 'nope';

    expect(() => getAgentChatId()).toThrow(/must be numeric/);
  });
});
