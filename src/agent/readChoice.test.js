jest.mock('./tools', () => ({ tools: [{
  name: 'get_leaderboard',
  parameters: require('zod').object({ leagueCode: require('zod').string().optional(), period: require('zod').enum(['season', 'race']).optional(), matchdayId: require('zod').number().int().positive().optional() }),
  execute: jest.fn(),
}] }));
const { tools } = require('./tools');
const { applyReadChoice } = require('./readChoice');
const { getRequestContext } = require('./requestContext');
beforeEach(() => jest.clearAllMocks());
test.each([{ leagueCode: 'C7' }, { leagueCode: 'C7', period: 'season' }, { leagueCode: 'C7', period: 'race', matchdayId: 10 }])('passes exact selected arguments %j under the authenticated identity', async (args) => {
  tools[0].execute.mockImplementation(async (received) => {
    expect(received).toEqual(args);
    expect(getRequestContext().chatId).toBe(42);

    return { status: 'ok' };
  });
  expect(await applyReadChoice({ chatId: 42, payload: { tool: 'get_leaderboard', args } })).toEqual({ status: 200, body: { status: 'ok' } });
});
test.each([null, { tool: 'confirm_write', args: {} }, { tool: 'get_leaderboard', args: [] }, { tool: 'get_leaderboard', args: { chatId: 99 } }, { tool: 'get_leaderboard', args: { matchdayId: -1 } }])('rejects unsupported tools and spoofed/invalid args %j', async (payload) => {
  expect(await applyReadChoice({ chatId: 42, payload })).toMatchObject({ status: 400 });
  expect(tools[0].execute).not.toHaveBeenCalled();
});
