jest.mock('../cores/availableChipsCore', () => ({ getAvailableChips: jest.fn() }));
jest.mock('../azureStorageService', () => ({ saveAvailableChipsSession: jest.fn(), getAvailableChipsSession: jest.fn() }));
jest.mock('../utils', () => ({ sendErrorMessage: jest.fn() }));
jest.mock('../i18n', () => ({ t: (key) => key, getLanguage: () => 'en' }));
const { getAvailableChips } = require('../cores/availableChipsCore');
const storage = require('../azureStorageService');
const { handleAvailableChipsCommand, handleAvailableChipsCallback, formatAvailableChips, splitText } = require('./availableChipsHandler');
const { parseAvailableChipsCommand } = require('../utils/availableChipsRequest');
const bot = { sendMessage: jest.fn().mockResolvedValue({}), answerCallbackQuery: jest.fn().mockResolvedValue({}) };
const msg = { chat: { id: 7 }, text: '/available_chips' };
beforeEach(() => { jest.clearAllMocks(); });
test('direct command and JSON arguments preserve scope and explicit targets', async () => {
  getAvailableChips.mockResolvedValue({ status: 'empty' });
  await handleAvailableChipsCommand(bot, { ...msg, text: '/available_chips {"teamName":"<Rocket>"}' });
  expect(getAvailableChips).toHaveBeenCalledWith({ chatId: 7, teamName: '<Rocket>' });
  expect(parseAvailableChipsCommand('/available_chips@my_bot {"scope":"tracked"}')).toEqual({ scope: 'tracked' });
});
test.each(['{"scope":"everything"}', '{"chatId":9}', '[]', 'null', 'broken', '{"teamId":4}'])('invalid suffix never reaches core: %s', async (suffix) => {
  await handleAvailableChipsCommand(bot, { ...msg, text: `/available_chips ${suffix}` });
  expect(getAvailableChips).not.toHaveBeenCalled();
  expect(bot.sendMessage).toHaveBeenCalledWith(7, 'Invalid available chips request.');
});
test('selectors paginate at 20 items, callbacks stay short and resume stored canonical args', async () => {
  const result = { status: 'selection_required', choice: 'team', options: Array.from({ length: 41 }, (_, index) => ({ label: `Team ${index}`, detail: 'owner/account', args: { teamId: `Owner_${index}_abc`, leagueCode: 'A' } })) };
  getAvailableChips.mockResolvedValueOnce(result).mockResolvedValue({ status: 'empty' });
  await handleAvailableChipsCommand(bot, msg);
  const session = storage.saveAvailableChipsSession.mock.calls[0][1];
  let keyboard = bot.sendMessage.mock.calls[0][2].reply_markup.inline_keyboard;
  expect(keyboard).toHaveLength(21);
  expect(keyboard.flat().every((item) => Buffer.byteLength(item.callback_data) <= 64)).toBe(true);
  storage.getAvailableChipsSession.mockResolvedValue(session);
  await handleAvailableChipsCallback(bot, { id: 'q', message: msg, data: `AC:${session.token}:p:2` });
  keyboard = bot.sendMessage.mock.calls.at(-1)[2].reply_markup.inline_keyboard;
  expect(keyboard[0][0].text).toContain('Team 40');
  await handleAvailableChipsCallback(bot, { id: 'q', message: msg, data: keyboard[0][0].callback_data });
  expect(getAvailableChips).toHaveBeenLastCalledWith({ chatId: 7, teamId: 'Owner_40_abc', leagueCode: 'A' });
});
test('expired or foreign selector tokens reopen scope choices', async () => {
  storage.getAvailableChipsSession.mockResolvedValue({ token: 'aaaaaaaaaaaa', createdAt: Date.now() - 4_000_000 });
  getAvailableChips.mockResolvedValue({ status: 'selection_required', choice: 'scope', options: [] });
  await handleAvailableChipsCallback(bot, { id: 'q', message: msg, data: 'AC:bbbbbbbbbbbb:s:0' });
  expect(getAvailableChips).toHaveBeenCalledWith({ chatId: 7 });
  expect(bot.sendMessage).toHaveBeenCalledWith(7, 'Selection expired. Choose again.');
});
test('plain-text results preserve names and split within Telegram limits without losing rows', async () => {
  const teams = Array.from({ length: 100 }, (_, index) => ({ teamName: `<b>Team_${index}</b>`, availableChips: index === 0 ? [] : index === 1 ? null : ['Wildcard', 'Autopilot'], updatedAt: null, leagues: [{ leagueName: 'League'.repeat(25) }] }));
  getAvailableChips.mockResolvedValue({ status: 'ok', partial: true, teams });
  await handleAvailableChipsCommand(bot, msg);
  const texts = bot.sendMessage.mock.calls.map((call) => call[1]);
  expect(texts.length).toBeGreaterThan(1);
  expect(texts.every((text) => text.length <= 3900)).toBe(true);
  teams.forEach((team) => expect(texts.join('\n')).toContain(team.teamName));
  expect(bot.sendMessage.mock.calls.every((call) => call.length === 2)).toBe(true);
  expect(texts.join('\n')).toContain('None remaining');
  expect(texts.join('\n')).toContain('Usage unavailable');
  expect(formatAvailableChips({ teams: [teams[0]] }, 7).join('')).toContain('Unknown update time');
  expect(splitText('😀'.repeat(5000)).join('')).toEqual('😀'.repeat(5000));
});
