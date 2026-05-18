const mockCalculateTeamInfo = jest.fn();
const mockCalculateBudgetAdjustedPoints = jest.fn();

jest.mock('../utils', () => ({
  calculateTeamInfo: mockCalculateTeamInfo,
  calculateBudgetAdjustedPoints: mockCalculateBudgetAdjustedPoints,
}));

const {
  currentTeamCache,
  driversCache,
  constructorsCache,
  selectedChipCache,
  userCache,
  remainingRaceCountCache,
  sharedKey,
  pricesCache,
} = require('../cache');
const { getCurrentTeam } = require('./currentTeamCore');

const CHAT_ID = 12345;
const TEAM_ID = 'Doron-Kilzi_1';

describe('getCurrentTeam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete currentTeamCache[CHAT_ID];
    delete driversCache[CHAT_ID];
    delete constructorsCache[CHAT_ID];
    delete selectedChipCache[CHAT_ID];
    delete userCache[String(CHAT_ID)];
    delete remainingRaceCountCache[sharedKey];
    pricesCache.drivers = {};
    pricesCache.constructors = {};
    pricesCache.metadata = null;
    mockCalculateTeamInfo.mockReset();
    mockCalculateBudgetAdjustedPoints.mockReset();
  });

  it('returns no_teams when the user has zero teams', async () => {
    const result = await getCurrentTeam({ chatId: CHAT_ID });
    expect(result).toEqual({ status: 'no_teams' });
  });

  it('returns missing_cache when drivers cache is empty', async () => {
    currentTeamCache[CHAT_ID] = {
      [TEAM_ID]: { drivers: ['VER'], constructors: ['MCL'] },
    };
    constructorsCache[CHAT_ID] = { MCL: { price: 10 } };
    // driversCache absent

    const result = await getCurrentTeam({ chatId: CHAT_ID });
    expect(result.status).toBe('missing_cache');
    expect(result.missing.drivers).toBe(true);
  });

  it('auto-picks the only team when teamId / teamName not provided', async () => {
    currentTeamCache[CHAT_ID] = {
      [TEAM_ID]: { teamName: 'Kilzi', drivers: ['VER'], constructors: ['MCL'] },
    };
    driversCache[CHAT_ID] = { VER: { price: 30 } };
    constructorsCache[CHAT_ID] = { MCL: { price: 10 } };
    mockCalculateTeamInfo.mockReturnValue({
      totalPrice: 40,
      costCapRemaining: 60,
      overallBudget: 100,
      teamExpectedPoints: 120,
      teamPriceChange: 0.5,
    });
    mockCalculateBudgetAdjustedPoints.mockReturnValue(125);

    const result = await getCurrentTeam({ chatId: CHAT_ID });

    expect(result.status).toBe('ok');
    expect(result.teamId).toBe(TEAM_ID);
    expect(result.teamName).toBe('Kilzi');
    expect(result.teamInfo.totalPrice).toBe(40);
    expect(result.teamInfo.teamExpectedPoints).toBe(120);
    // ppm default is 0 → budgetAdjustedPoints null
    expect(result.budgetAdjustedPoints).toBeNull();
  });

  it('returns budgetAdjustedPoints when ppm preset > 0', async () => {
    currentTeamCache[CHAT_ID] = {
      [TEAM_ID]: { teamName: 'Kilzi', drivers: ['VER'], constructors: ['MCL'] },
    };
    driversCache[CHAT_ID] = { VER: { price: 30 } };
    constructorsCache[CHAT_ID] = { MCL: { price: 10 } };
    userCache[String(CHAT_ID)] = {
      bestTeamBudgetChangePointsPerMillion: { [TEAM_ID]: 1.3 },
    };
    remainingRaceCountCache[sharedKey] = 5;
    mockCalculateTeamInfo.mockReturnValue({
      totalPrice: 40,
      costCapRemaining: 60,
      overallBudget: 100,
      teamExpectedPoints: 120,
      teamPriceChange: 1.0,
    });
    mockCalculateBudgetAdjustedPoints.mockReturnValue(125.5);

    const result = await getCurrentTeam({ chatId: CHAT_ID });

    expect(result.status).toBe('ok');
    expect(result.budgetChangePointsPerMillion).toBe(1.3);
    expect(result.budgetAdjustedPoints).toBe(125.5);
    expect(result.remainingRaceCount).toBe(5);
  });

  it('returns unknown_team when teamId not in cache', async () => {
    currentTeamCache[CHAT_ID] = {
      [TEAM_ID]: { drivers: [], constructors: [] },
    };
    const result = await getCurrentTeam({ chatId: CHAT_ID, teamId: 'OTHER' });
    expect(result.status).toBe('unknown_team');
    expect(result.teamIds).toContain(TEAM_ID);
  });

  it('returns ambiguous_team when >1 team and no selection', async () => {
    currentTeamCache[CHAT_ID] = {
      [TEAM_ID]: { drivers: [], constructors: [] },
      OTHER: { drivers: [], constructors: [] },
    };
    const result = await getCurrentTeam({ chatId: CHAT_ID });
    expect(result.status).toBe('ambiguous_team');
    expect(result.teamIds).toEqual(expect.arrayContaining([TEAM_ID, 'OTHER']));
  });

  it('resolves teamName to teamId on exact match', async () => {
    currentTeamCache[CHAT_ID] = {
      [TEAM_ID]: { teamName: 'Kilzi', drivers: ['VER'], constructors: ['MCL'] },
      OTHER: { teamName: 'Other', drivers: ['VER'], constructors: ['MCL'] },
    };
    driversCache[CHAT_ID] = { VER: { price: 30 } };
    constructorsCache[CHAT_ID] = { MCL: { price: 10 } };
    mockCalculateTeamInfo.mockReturnValue({
      totalPrice: 40,
      costCapRemaining: 60,
      overallBudget: 100,
      teamExpectedPoints: 100,
      teamPriceChange: 0,
    });
    mockCalculateBudgetAdjustedPoints.mockReturnValue(100);

    const result = await getCurrentTeam({ chatId: CHAT_ID, teamName: 'Kilzi' });
    expect(result.status).toBe('ok');
    expect(result.teamId).toBe(TEAM_ID);
  });

  it('exposes selected chip when present', async () => {
    currentTeamCache[CHAT_ID] = {
      [TEAM_ID]: { teamName: 'Kilzi', drivers: ['VER'], constructors: ['MCL'] },
    };
    driversCache[CHAT_ID] = { VER: { price: 30 } };
    constructorsCache[CHAT_ID] = { MCL: { price: 10 } };
    selectedChipCache[CHAT_ID] = { [TEAM_ID]: 'EXTRA_BOOST' };
    mockCalculateTeamInfo.mockReturnValue({
      totalPrice: 40,
      costCapRemaining: 60,
      overallBudget: 100,
      teamExpectedPoints: 100,
      teamPriceChange: 0,
    });
    mockCalculateBudgetAdjustedPoints.mockReturnValue(100);

    const result = await getCurrentTeam({ chatId: CHAT_ID });
    expect(result.chip).toBe('EXTRA_BOOST');
  });
});
