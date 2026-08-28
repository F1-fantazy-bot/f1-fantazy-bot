jest.mock('../azureStorageService', () => ({
  getLeagueData: jest.fn(),
}));
jest.mock('../leagueRegistryService', () => ({
  addUserLeague: jest.fn(),
  getUserLeague: jest.fn(),
}));

const { getLeagueData } = require('../azureStorageService');
const {
  addUserLeague,
  getUserLeague,
} = require('../leagueRegistryService');
const {
  normalizeLeagueCode,
  inspectLeagueFollow,
  followLeague,
} = require('./followLeagueService');

beforeEach(() => {
  jest.clearAllMocks();
  getLeagueData.mockResolvedValue({
    leagueName: 'Friends League',
  });
  getUserLeague.mockResolvedValue(null);
  addUserLeague.mockResolvedValue(undefined);
});

test('normalizes and validates league codes', async () => {
  expect(normalizeLeagueCode(' ab12 ')).toBe('AB12');
  await expect(
    inspectLeagueFollow({ chatId: 42, leagueCode: 'bad!' }),
  ).resolves.toMatchObject({ status: 'invalid_input' });
  expect(getLeagueData).not.toHaveBeenCalled();
});

test('returns not_found without persistence when blob is missing', async () => {
  getLeagueData.mockResolvedValue(null);

  const result = await followLeague({
    chatId: 42,
    leagueCode: 'abc123',
  });

  expect(result).toMatchObject({
    status: 'not_found',
    leagueCode: 'ABC123',
    followed: false,
    nextSteps: {
      reportCommand: '/report_bug',
    },
  });
  expect(result.summary).toContain('League "ABC123" was not found.');
  expect(result.summary).toContain('click the share button');
  expect(result.summary).toContain('/report_bug');
  expect(addUserLeague).not.toHaveBeenCalled();
});

test('returns localized actionable not-found guidance', async () => {
  const { userCache } = require('../cache');
  userCache['42'] = { lang: 'he' };
  getLeagueData.mockResolvedValue(null);

  const result = await followLeague({
    chatId: 42,
    leagueCode: 'ABC123',
  });

  expect(result.summary).toContain('הליגה "ABC123" לא נמצאה');
  expect(result.summary).toContain('כפתור השיתוף');
  expect(result.summary).toContain('/report_bug');
  delete userCache['42'];
});

test('agent guidance contacts admins without Telegram commands', async () => {
  getLeagueData.mockResolvedValue(null);

  const result = await followLeague({
    chatId: 42,
    leagueCode: 'ABC123',
    surface: 'agent',
  });

  expect(result.summary).toContain('contact the administrators');
  expect(result.summary).toContain('cannot submit missing-league reports');
  expect(result.summary).not.toContain('/report_bug');
  expect(result.nextSteps).toEqual(
    expect.objectContaining({ contactAdmins: true }),
  );
  expect(result.nextSteps.reportCommand).toBeUndefined();
});

test('returns a durable no-op when the league is already followed', async () => {
  getUserLeague.mockResolvedValue({
    leagueCode: 'ABC123',
    leagueName: 'Friends League',
  });

  await expect(
    followLeague({ chatId: 42, leagueCode: 'abc123' }),
  ).resolves.toMatchObject({
    status: 'ok',
    changed: false,
    leagueCode: 'ABC123',
  });
  expect(addUserLeague).not.toHaveBeenCalled();
});

test('persists a verified league follow', async () => {
  await expect(
    followLeague({ chatId: 42, leagueCode: 'abc123' }),
  ).resolves.toMatchObject({
    status: 'ok',
    changed: true,
    leagueName: 'Friends League',
  });
  expect(addUserLeague).toHaveBeenCalledWith(
    42,
    'ABC123',
    'Friends League',
  );
});
