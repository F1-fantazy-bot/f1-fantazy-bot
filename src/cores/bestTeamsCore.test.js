const { KILZI_CHAT_ID } = require('../constants');

const mockCalculateBestTeams = jest.fn();
jest.mock('../bestTeamsCalculator', () => ({
  calculateBestTeams: (...args) => mockCalculateBestTeams(...args),
}));

const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  sharedKey,
  remainingRaceCountCache,
  nextRaceInfoCache,
  userCache,
  pricesCache,
} = require('../cache');

const { computeBestTeams, normalizeCode } = require('./bestTeamsCore');

const TEAM_ID = 'T1';
const TEAM_ID_2 = 'T2';

function seedValidCache({
  drivers = { VER: { price: 30 }, HAM: { price: 28 } },
  constructors = { RED: { price: 35 }, MER: { price: 32 } },
  currentTeam = {
    drivers: ['VER', 'HAM'],
    constructors: ['RED', 'MER'],
    boost: 'VER',
    freeTransfers: 2,
    costCapRemaining: 5,
    teamName: 'kilzid3',
  },
} = {}) {
  driversCache[KILZI_CHAT_ID] = drivers;
  constructorsCache[KILZI_CHAT_ID] = constructors;
  currentTeamCache[KILZI_CHAT_ID] = { [TEAM_ID]: currentTeam };
}

function clearCaches() {
  delete driversCache[KILZI_CHAT_ID];
  delete driversCache[sharedKey];
  delete constructorsCache[KILZI_CHAT_ID];
  delete constructorsCache[sharedKey];
  delete currentTeamCache[KILZI_CHAT_ID];
  delete selectedChipCache[KILZI_CHAT_ID];
  delete remainingRaceCountCache[sharedKey];
  delete nextRaceInfoCache[sharedKey];
  delete userCache[String(KILZI_CHAT_ID)];
  pricesCache.drivers = {};
  pricesCache.constructors = {};
  pricesCache.driverEntries = [];
  pricesCache.constructorEntries = [];
  pricesCache.metadata = null;
}

describe('normalizeCode', () => {
  it('returns uppercase 3-letter codes as-is', () => {
    expect(normalizeCode('VER')).toBe('VER');
    expect(normalizeCode('ver')).toBe('VER');
    expect(normalizeCode(' Ver ')).toBe('VER');
  });

  it('resolves full driver names through NAME_TO_CODE_MAPPING', () => {
    expect(normalizeCode('M. Verstappen')).toBe('VER');
    expect(normalizeCode('mclaren')).toBe('MCL');
    expect(normalizeCode('Red Bull Racing')).toBe('RED');
  });

  it('returns null for unknown names', () => {
    expect(normalizeCode('Some Random Driver')).toBeNull();
    expect(normalizeCode('')).toBeNull();
    expect(normalizeCode(null)).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });
});

describe('computeBestTeams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCaches();
  });

  it('returns no_teams when chat has no tracked teams', async () => {
    const result = await computeBestTeams({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('no_teams');
    expect(mockCalculateBestTeams).not.toHaveBeenCalled();
  });

  it('returns unknown_team when requested teamId not in cache', async () => {
    seedValidCache();
    const result = await computeBestTeams({
      chatId: KILZI_CHAT_ID,
      teamId: 'does_not_exist',
    });
    expect(result.status).toBe('unknown_team');
    expect(mockCalculateBestTeams).not.toHaveBeenCalled();
  });

  it('resolves teamName via exact match against cached teamName', async () => {
    seedValidCache();
    mockCalculateBestTeams.mockReturnValue([]);
    const result = await computeBestTeams({
      chatId: KILZI_CHAT_ID,
      teamName: 'kilzid3',
    });
    expect(result.status).toBe('ok');
    expect(result.teamId).toBe(TEAM_ID);
  });

  it('returns ambiguous_team when teamName matches multiple teams', async () => {
    seedValidCache();
    currentTeamCache[KILZI_CHAT_ID][TEAM_ID_2] = {
      drivers: ['VER', 'HAM'],
      constructors: ['RED', 'MER'],
      teamName: 'kilzid3',
    };
    const result = await computeBestTeams({
      chatId: KILZI_CHAT_ID,
      teamName: 'kilzid3',
    });
    expect(result.status).toBe('ambiguous_team');
    expect(result.teamIds).toEqual([TEAM_ID, TEAM_ID_2]);
  });

  it('returns ambiguous_team when multiple teams + no selectedTeam', async () => {
    seedValidCache();
    currentTeamCache[KILZI_CHAT_ID][TEAM_ID_2] = {
      drivers: ['VER', 'HAM'],
      constructors: ['RED', 'MER'],
      teamName: 'second',
    };
    const result = await computeBestTeams({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('ambiguous_team');
  });

  it('uses selectedTeam when multiple teams', async () => {
    seedValidCache();
    currentTeamCache[KILZI_CHAT_ID][TEAM_ID_2] = {
      drivers: ['VER', 'HAM'],
      constructors: ['RED', 'MER'],
      teamName: 'second',
    };
    userCache[String(KILZI_CHAT_ID)] = { selectedTeam: TEAM_ID_2 };
    mockCalculateBestTeams.mockReturnValue([]);
    const result = await computeBestTeams({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('ok');
    expect(result.teamId).toBe(TEAM_ID_2);
  });

  it('returns missing_cache when drivers cache is absent', async () => {
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: { drivers: ['VER'], constructors: ['RED'] },
    };
    const result = await computeBestTeams({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('missing_cache');
  });

  it('returns missing_remaining_race_count when ppm>0 + no race count', async () => {
    seedValidCache();
    userCache[String(KILZI_CHAT_ID)] = {
      bestTeamBudgetChangePointsPerMillion: { [TEAM_ID]: 1.5 },
    };
    const result = await computeBestTeams({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('missing_remaining_race_count');
  });

  it('returns unknown_filter when must-include contains unresolvable name', async () => {
    seedValidCache();
    const result = await computeBestTeams({
      chatId: KILZI_CHAT_ID,
      mustIncludeDrivers: ['M. Verstappen', 'Some Driver That Does Not Exist'],
    });
    expect(result.status).toBe('unknown_filter');
    expect(result.filters.mustIncludeDrivers.resolved).toEqual(['VER']);
    expect(result.filters.mustIncludeDrivers.unknown).toEqual([
      'Some Driver That Does Not Exist',
    ]);
    expect(mockCalculateBestTeams).not.toHaveBeenCalled();
  });

  it('passes filters + rankBy + resultCount through to calculator', async () => {
    seedValidCache();
    mockCalculateBestTeams.mockReturnValue([]);
    await computeBestTeams({
      chatId: KILZI_CHAT_ID,
      mustIncludeDrivers: ['VER'],
      mustExcludeDrivers: ['ALO'],
      mustIncludeConstructors: ['MCL'],
      mustExcludeConstructors: ['FER'],
      rankBy: 'budget_adjusted',
      resultCount: 5,
    });
    expect(mockCalculateBestTeams).toHaveBeenCalledTimes(1);
    const optionsArg = mockCalculateBestTeams.mock.calls[0][4];
    expect(optionsArg).toEqual({
      mustIncludeDrivers: ['VER'],
      mustExcludeDrivers: ['ALO'],
      mustIncludeConstructors: ['MCL'],
      mustExcludeConstructors: ['FER'],
      rankBy: 'budget_adjusted',
      resultCount: 5,
    });
  });

  it('skips the options arg entirely when no filters / rankBy', async () => {
    seedValidCache();
    mockCalculateBestTeams.mockReturnValue([]);
    await computeBestTeams({ chatId: KILZI_CHAT_ID });
    expect(mockCalculateBestTeams).toHaveBeenCalledTimes(1);
    // Telegram path must call calculator with exactly 4 positional args.
    expect(mockCalculateBestTeams.mock.calls[0]).toHaveLength(4);
  });

  it('passes canonical prices over chat-specific imported prices', async () => {
    seedValidCache({
      drivers: { VER: { price: 1, expectedPoints: 25 } },
      constructors: { RED: { price: 2, expectedPoints: 30 } },
      currentTeam: {
        drivers: ['VER'],
        constructors: ['RED'],
        boost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 5,
      },
    });
    pricesCache.drivers = { VER: 31.4 };
    pricesCache.constructors = { RED: 21.3 };
    mockCalculateBestTeams.mockReturnValue([]);

    await computeBestTeams({ chatId: KILZI_CHAT_ID });

    expect(mockCalculateBestTeams.mock.calls[0][0]).toEqual({
      Drivers: { VER: { price: 31.4, expectedPoints: 25 } },
      Constructors: { RED: { price: 21.3, expectedPoints: 30 } },
      CurrentTeam: currentTeamCache[KILZI_CHAT_ID][TEAM_ID],
    });
  });

  it('uses IDs and the inactive-driver penalty for an enriched league team', async () => {
    seedValidCache({
      drivers: {
        LAW: { DR: 'LAW', price: 14.5, expectedPoints: 9, expectedPriceChange: 0.1 },
        TSU: { DR: 'TSU', price: 10.3, expectedPoints: 3, expectedPriceChange: 0 },
      },
      constructors: { RED: { price: 20, expectedPoints: 30 } },
      currentTeam: {
        drivers: ['HAD', 'LAW'],
        driverIds: ['11032', '114'],
        constructors: ['RED'],
        boost: 'LAW',
        boostDriverId: '114',
        freeTransfers: 2,
        costCapRemaining: 5,
      },
    });
    pricesCache.driverEntries = [
      { id: '11032', code: 'HAD', price: 14.5, isActive: false },
      { id: '116', code: 'LAW', price: 14.5, isActive: true },
      { id: '114', code: 'LAW', price: 10.3, isActive: false },
      { id: '130', code: 'TSU', price: 10.3, isActive: true },
    ];
    nextRaceInfoCache[sharedKey] = { weekendFormat: 'regular' };
    mockCalculateBestTeams.mockReturnValue([]);

    const result = await computeBestTeams({ chatId: KILZI_CHAT_ID });

    expect(result.status).toBe('ok');
    expect(mockCalculateBestTeams.mock.calls[0][0]).toMatchObject({
      Drivers: {
        11032: { DR: 'HAD', expectedPoints: -25, expectedPriceChange: 0 },
        114: { DR: 'LAW', expectedPoints: -25, expectedPriceChange: 0 },
        116: { DR: 'LAW', expectedPoints: 9, price: 14.5 },
        130: { DR: 'TSU', expectedPoints: 3, price: 10.3 },
      },
      CurrentTeam: {
        drivers: ['11032', '114'],
        boost: '114',
      },
    });
    expect(result.calculationData).toBe(mockCalculateBestTeams.mock.calls[0][0]);
  });

  it('returns teamName from cache when status is ok', async () => {
    seedValidCache();
    mockCalculateBestTeams.mockReturnValue([
      { row: 1, drivers: ['VER'], constructors: ['RED'] },
    ]);
    const result = await computeBestTeams({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('ok');
    expect(result.teamName).toBe('kilzid3');
  });

  it('falls back to teamId when no teamName cached', async () => {
    seedValidCache({
      currentTeam: {
        drivers: ['VER', 'HAM'],
        constructors: ['RED', 'MER'],
        boost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 5,
        // teamName intentionally omitted (screenshot team)
      },
    });
    mockCalculateBestTeams.mockReturnValue([]);
    const result = await computeBestTeams({ chatId: KILZI_CHAT_ID });
    expect(result.teamName).toBe(TEAM_ID);
  });
});
