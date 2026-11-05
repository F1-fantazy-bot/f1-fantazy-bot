const { currentTeamCache, userCache } = require('../cache');
const { handleSelectTeamCommand } = require('./selectTeamHandler');
const { resolveTeamSelector } = require('../utils/teamCallbackSelector');

test('two Tom accounts yield distinct short selected-team buttons', async () => {
  const chatId = 987654;
  const idA = 'Tom-Kregenbild_1_aaaaaaaaaaaa';
  const idB = 'Tom-Kregenbild_1_bbbbbbbbbbbb';
  currentTeamCache[chatId] = {
    [idA]: { teamName: 'NoNoItsSoNotRightMikeyNO', userName: 'Tom Kregenbild',
      teamNo: 1, accountId: 'aaaaaaaaaaaa' },
    [idB]: { teamName: 'Agentic Racing Co.', userName: 'Tom Kregenbild',
      teamNo: 1, accountId: 'bbbbbbbbbbbb' },
  };
  userCache[chatId] = { selectedTeam: idA };
  const bot = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  try {
    await handleSelectTeamCommand(bot, { chat: { id: chatId }, message_id: 1 });
    const buttons = bot.sendMessage.mock.calls[0][2].reply_markup.inline_keyboard.flat();
    expect(buttons.map((button) => button.callback_data)).toEqual([
      'TEAM:1_aaaaaaaaaaaa', 'TEAM:1_bbbbbbbbbbbb',
    ]);
    expect(buttons.every((button) => Buffer.byteLength(button.callback_data, 'utf8') <= 64)).toBe(true);
    expect(resolveTeamSelector(chatId, buttons[0].callback_data.split(':')[1])).toBe(idA);
    expect(resolveTeamSelector(chatId, buttons[1].callback_data.split(':')[1])).toBe(idB);
  } finally {
    delete currentTeamCache[chatId];
    delete userCache[chatId];
  }
});
