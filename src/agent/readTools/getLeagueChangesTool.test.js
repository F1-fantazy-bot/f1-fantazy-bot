jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));
jest.mock('../../cores/leagueChangesCore', () => ({
  compareLeagueChanges: jest.fn(),
}));
jest.mock('../../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));
jest.mock('../../azureStorageService', () => ({
  getLockedTeamsData: jest.fn(),
  getLeagueTeamsData: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../cacheBootstrap', () => ({ ensureCacheReady: jest.fn() }));
jest.mock('../identity', () => ({ getAgentChatId: jest.fn() }));
jest.mock('../wrapToolExecute', () => ({
  wrapToolExecute: jest.fn((name, execute) => {
    execute.wrappedToolName = name;

    return execute;
  }),
}));

const {
  compareLeagueChanges,
} = require('../../cores/leagueChangesCore');
const { listUserLeagues } = require('../../leagueRegistryService');
const {
  getLockedTeamsData,
  getLeagueTeamsData,
} = require('../../azureStorageService');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');
const { getLeagueChangesTool } = require('./getLeagueChangesTool');

beforeEach(() => {
  jest.clearAllMocks();
  getAgentChatId.mockReturnValue(42);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'he' });
  listUserLeagues.mockResolvedValue([
    { leagueCode: 'ABC', leagueName: 'Alpha', registeredAt: 'private' },
    { leagueCode: 'XYZ', leagueName: '' },
  ]);
});

test('is registered through wrapToolExecute', () => {
  expect(getLeagueChangesTool.execute.wrappedToolName).toBe(
    'get_league_changes',
  );
  expect(wrapToolExecute).toEqual(expect.any(Function));
});

test.each([
  [['ABC'], 'one followed league'],
  [['ABC', 'XYZ'], 'multiple followed leagues'],
])('returns clickable canonical leagues with no target: %s', async (codes) => {
  listUserLeagues.mockResolvedValue(
    codes.map((leagueCode) => ({
      leagueCode,
      leagueName: `League ${leagueCode}`,
      registeredAt: 'not-public',
    })),
  );

  const result = await getLeagueChangesTool.execute({});

  expect(result).toEqual({
    status: 'select_league',
    lang: 'he',
    leagues: codes.map((leagueCode) => ({
      leagueCode,
      leagueName: `League ${leagueCode}`,
    })),
  });
  expect(getLockedTeamsData).not.toHaveBeenCalled();
});

test('returns an empty state when the user follows no leagues', async () => {
  listUserLeagues.mockResolvedValue([]);

  await expect(getLeagueChangesTool.execute({})).resolves.toEqual({
    status: 'no_followed_leagues',
    lang: 'he',
    leagues: [],
  });
});

test('rejects arbitrary league access before blob reads', async () => {
  const result = await getLeagueChangesTool.execute({ leagueCode: 'NOPE' });

  expect(result).toEqual({
    status: 'not_followed',
    lang: 'he',
    leagueCode: 'NOPE',
  });
  expect(getLockedTeamsData).not.toHaveBeenCalled();
});

test('loads both snapshots and returns the pure comparison', async () => {
  const latest = { matchdayId: 7 };
  const planning = { matchdayId: 7 };
  getLockedTeamsData.mockResolvedValue(latest);
  getLeagueTeamsData.mockResolvedValue(planning);
  compareLeagueChanges.mockReturnValue({
    status: 'ok',
    matchdayId: 7,
    leagueName: 'Blob Name',
    teams: [],
    changedTeams: [],
    unchangedTeams: [],
  });

  const result = await getLeagueChangesTool.execute({ leagueCode: 'ABC' });

  expect(ensureCacheReady).toHaveBeenCalledTimes(1);
  expect(getLockedTeamsData).toHaveBeenCalledWith('ABC');
  expect(getLeagueTeamsData).toHaveBeenCalledWith('ABC');
  expect(compareLeagueChanges).toHaveBeenCalledWith({ latest, planning });
  expect(result).toMatchObject({
    status: 'ok',
    lang: 'he',
    leagueCode: 'ABC',
    leagueName: 'Blob Name',
  });
});

test('does not convert storage errors into raw result fields', async () => {
  getLockedTeamsData.mockRejectedValue(new Error('secret storage path'));
  getLeagueTeamsData.mockResolvedValue(null);

  await expect(
    getLeagueChangesTool.execute({ leagueCode: 'ABC' }),
  ).rejects.toThrow('secret storage path');
});
