const { KILZI_CHAT_ID, EXTRA_BOOST_CHIP, LIMITLESS_CHIP, WILDCARD_CHIP } = require('../constants');

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
  });

  it('should send no teams message if no current team cache exists', async () => {
    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      "No teams found. Please run /follow_league to follow your F1 Fantasy league (if you haven't yet), then /teams_tracker to pick teams to track.",
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

  it.each([undefined, 'WITHOUT_CHIP', LIMITLESS_CHIP, EXTRA_BOOST_CHIP, WILDCARD_CHIP])('renders independent scenarios with saved chip %s', async (savedChip) => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 }, NOR: { price: 25.1 } };
    constructorsCache[KILZI_CHAT_ID] = { MCL: { price: 25 }, FER: { price: 20 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: { drivers: ['VER'], constructors: ['MCL'], freeTransfers: 2 },
    };
    selectedChipCache[KILZI_CHAT_ID] = { [TEAM_ID]: savedChip };
    const savedState = JSON.stringify({ chips: selectedChipCache, teams: currentTeamCache });
    remainingRaceCountCache[sharedKey] = 10;

    calculateBestTeams.mockImplementation((_, chip, ppm) => {
      const baseline = 300 + ppm;
      const scoreByChip = {
        null: baseline,
        [LIMITLESS_CHIP]: baseline + 120,
        [EXTRA_BOOST_CHIP]: baseline + 50,
        [WILDCARD_CHIP]: baseline + 20,
      };

      return [
        {
          projected_points: scoreByChip[chip],
          expected_price_change: chip === LIMITLESS_CHIP ? 0.4 : 0.8,
        },
      ];
    });

    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);

    expect(calculateBestTeams).toHaveBeenCalledTimes(16);

    const ppmValues = [...new Set(calculateBestTeams.mock.calls.map(([, , ppm]) => ppm))];
    expect(ppmValues).toEqual([0, 1.3, 1.65, 2]);

    for (const ppm of ppmValues) {
      expect(calculateBestTeams.mock.calls.filter(([, , value]) => value === ppm)
        .map(([, chip]) => chip)).toEqual([null, LIMITLESS_CHIP, EXTRA_BOOST_CHIP, WILDCARD_CHIP]);
    }
    expect(JSON.stringify({ chips: selectedChipCache, teams: currentTeamCache })).toBe(savedState);

    const [sentChatId, sentMessage, options] = botMock.sendMessage.mock.calls[0];
    expect(sentChatId).toBe(KILZI_CHAT_ID);
    expect(options).toEqual({ parse_mode: 'Markdown' });
    expect(sentMessage).toContain('*Best Team Scenarios*');
    expect(sentMessage).toContain('*0.00 points per million*');
    expect(sentMessage).toContain('*1.30 points per million*');
    expect(sentMessage).toContain('*1.65 points per million*');
    expect(sentMessage).toContain('*2.00 points per million*');
    expect(sentMessage).toContain('• *Without Chip* — 300.00 pts | Δ 0.80');
    expect(sentMessage).toContain('• *Limitless* — 420.00 pts | Δ 0.40 🟢');
    expect(sentMessage).toContain('• *Extra Boost* — 350.00 pts | Δ 0.80 🟡');
    expect(sentMessage).toContain('• *Wildcard* — 320.00 pts | Δ 0.80 🟡');

    delete selectedChipCache[KILZI_CHAT_ID];
    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);
    expect(botMock.sendMessage.mock.calls[1][1]).toBe(sentMessage);
  });

  it('should continue when remaining race count is unavailable', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: { drivers: ['VER'], constructors: ['RBR'], freeTransfers: 2 },
    };

    calculateBestTeams.mockReturnValue([{ projected_points: 1, expected_price_change: 1 }]);

    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);

    expect(calculateBestTeams).toHaveBeenCalled();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('*Best Team Scenarios*'),
      { parse_mode: 'Markdown' },
    );
  });

  it('renders unavailable results without recommendation indicators', async () => {
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30 } };
    constructorsCache[KILZI_CHAT_ID] = { RED: { price: 20 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      [TEAM_ID]: { drivers: ['VER'], constructors: ['RED'], freeTransfers: 2 },
    };
    calculateBestTeams.mockReturnValue([]);
    await handleBestTeamScenariosMessage(botMock, KILZI_CHAT_ID);
    const message = botMock.sendMessage.mock.calls[0][1];
    expect(message.match(/Unavailable/g)).toHaveLength(16);
    expect(message).not.toMatch(/🟢|🟡/);
  });
});
