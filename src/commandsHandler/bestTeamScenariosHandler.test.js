const { KILZI_CHAT_ID, EXTRA_DRS_CHIP, LIMITLESS_CHIP, WILDCARD_CHIP } = require('../constants');

const mockValidateJsonData = jest.fn().mockReturnValue(true);

jest.mock('../utils', () => ({
  validateJsonData: mockValidateJsonData,
}));

const { calculateBestTeams } = require('../bestTeamsCalculator');
jest.mock('../bestTeamsCalculator', () => ({
  calculateBestTeams: jest.fn(),
}));

const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  sharedKey,
  remainingRaceCountCache,
  userCache,
} = require('../cache');

const {
  handleBestTeamScenariosMessage,
} = require('./bestTeamScenariosHandler');

describe('handleBestTeamScenariosMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };
  const TEAM_ID = 'T1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateJsonData.mockReset();
    mockValidateJsonData.mockReturnValue(true);
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
    delete selectedChipCache[KILZI_CHAT_ID];
    delete remainingRaceCountCache[sharedKey];
    delete userCache[String(KILZI_CHAT_ID)];
  });

  it('should send no teams message if no current team cache exists', async () => {
    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'No teams found. Please upload a team screenshot first.',
    );
    expect(calculateBestTeams).not.toHaveBeenCalled();
  });

  it('should send missing cache message if required caches are missing', async () => {
    currentTeamCache[KILZI_CHAT_ID] = { [TEAM_ID]: { drivers: [], constructors: [] } };

    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.',
    );
    expect(calculateBestTeams).not.toHaveBeenCalled();
  });

  it('should run 7 scenarios and render summary message', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 }, NOR: { price: 25.1 } };
    constructorsCache[KILZI_CHAT_ID] = { MCL: { price: 25 }, FER: { price: 20 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: { drivers: ['VER'], constructors: ['MCL'], freeTransfers: 2 },
    };
    selectedChipCache[KILZI_CHAT_ID] = { [TEAM_ID]: 'WITHOUT_CHIP' };
    remainingRaceCountCache[sharedKey] = 10;
    userCache[String(KILZI_CHAT_ID)] = {
      bestTeamBudgetChangePointsPerMillion: { [TEAM_ID]: 1.65 },
    };

    let idx = 0;
    const results = [
      { projected_points: 312.4, expected_price_change: 0.7, budget_adjusted_points: 312.4 },
      { projected_points: 308.1, expected_price_change: 1.6, budget_adjusted_points: 328.9 },
      { projected_points: 305.7, expected_price_change: 1.9, budget_adjusted_points: 337.05 },
      { projected_points: 301.9, expected_price_change: 2.3, budget_adjusted_points: 347.9 },
      { projected_points: 326.8, expected_price_change: 0.8, budget_adjusted_points: 340 },
      { projected_points: 354.2, expected_price_change: 0.4, budget_adjusted_points: 360 },
      { projected_points: 309.7, expected_price_change: 2.6, budget_adjusted_points: 352.6 },
    ];
    calculateBestTeams.mockImplementation(() => [results[idx++]]);

    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);

    expect(calculateBestTeams).toHaveBeenCalledTimes(7);

    const rankingPpmValues = calculateBestTeams.mock.calls
      .slice(0, 4)
      .map(([, , budgetChangePointsPerMillion]) => budgetChangePointsPerMillion);
    expect(rankingPpmValues).toEqual([0, 1.3, 1.65, 2]);

    const chipValues = calculateBestTeams.mock.calls
      .slice(4)
      .map(([, selectedChip]) => selectedChip);
    expect(chipValues).toEqual([EXTRA_DRS_CHIP, LIMITLESS_CHIP, WILDCARD_CHIP]);

    const [sentChatId, sentMessage, options] = botMock.sendMessage.mock.calls[0];
    expect(sentChatId).toBe(KILZI_CHAT_ID);
    expect(options).toEqual({ parse_mode: 'Markdown' });
    expect(sentMessage).toContain('*Best Team Scenarios*');
    expect(sentMessage).toContain('*Ranking Modes*');
    expect(sentMessage).toContain('*0.00 ppm* — 312.40 pts | Δ 0.70 | Adj 312.40');
    expect(sentMessage).toContain('*2.00 ppm* — 301.90 pts | Δ 2.30 | Adj 347.90');
    expect(sentMessage).toContain('*Chips*');
    expect(sentMessage).toContain('*Extra DRS* — 326.80 pts | Δ 0.80');
    expect(sentMessage).toContain('*Limitless* — 354.20 pts | Δ 0.40');
    expect(sentMessage).toContain('*Wildcard* — 309.70 pts | Δ 2.60');
  });

  it('should fail when remaining race count is missing and ranking preference is non-zero', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: { drivers: ['VER'], constructors: ['RBR'] },
    };
    userCache[String(KILZI_CHAT_ID)] = {
      bestTeamBudgetChangePointsPerMillion: { [TEAM_ID]: 2 },
    };

    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);

    expect(calculateBestTeams).not.toHaveBeenCalled();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Remaining race count is unavailable right now. Switch to Pure Points or try again later.',
    );
  });

  it('should preserve /best_teams semantics for ranking scenarios by using selected chip', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: { drivers: ['VER'], constructors: ['RBR'], freeTransfers: 2 },
    };
    selectedChipCache[KILZI_CHAT_ID] = { [TEAM_ID]: LIMITLESS_CHIP };
    remainingRaceCountCache[sharedKey] = 5;

    calculateBestTeams.mockReturnValue([{ projected_points: 1, expected_price_change: 1, budget_adjusted_points: 1 }]);

    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);

    const rankingScenarioChips = calculateBestTeams.mock.calls
      .slice(0, 4)
      .map(([, chip]) => chip);
    expect(rankingScenarioChips).toEqual([
      LIMITLESS_CHIP,
      LIMITLESS_CHIP,
      LIMITLESS_CHIP,
      LIMITLESS_CHIP,
    ]);
  });
});
