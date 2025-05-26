const {
  KILZI_CHAT_ID,
  COMMAND_BEST_TEAMS,
  COMMAND_CURRENT_TEAM_INFO: COMMAND_CURRENT_TEAM_BUDGET,
  COMMAND_PRINT_CACHE,
  COMMAND_RESET_CACHE,
  COMMAND_HELP,
  COMMAND_GET_BOTFATHER_COMMANDS,
  COMMAND_NEXT_RACE_INFO,
  USER_COMMANDS_CONFIG,
} = require('./constants');

const mockIsAdmin = jest.fn().mockReturnValue(true);
const mockGetChatName = jest.fn().mockReturnValue('Unknown');
const mockSendLogMessage = jest.fn();
const mockCalculateTeamInfo = jest.fn();

const mockValidateJsonData = jest.fn().mockReturnValue(true);

jest.mock('./utils/utils', () => {
  const originalUtils = jest.requireActual('./utils/utils');

  return {
    getChatName: mockGetChatName,
    sendLogMessage: mockSendLogMessage,
    calculateTeamInfo: mockCalculateTeamInfo,
    isAdminMessage: mockIsAdmin,
    validateJsonData: mockValidateJsonData,
    formatSessionDateTime: originalUtils.formatSessionDateTime,
  };
});

const { getWeatherForecast } = require('./utils/weatherApi');
jest.mock('./utils/weatherApi', () => ({
  getWeatherForecast: jest.fn(),
}));

const azureStorageService = require('./azureStorageService');
jest.mock('./azureStorageService', () => ({
  saveUserTeam: jest.fn().mockResolvedValue(undefined),
  deleteUserTeam: jest.fn().mockResolvedValue(undefined),
}));

const { handleMessage } = require('./messageHandler');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  nextRaceInfoCache,
  weatherForecastCache,
} = require('./cache');

const timesCalledSendLogMessageInMessageHandler = 1;
describe('handleTextMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateJsonData.mockReset();
    mockValidateJsonData.mockReturnValue(true);
    azureStorageService.saveUserTeam.mockClear();
    azureStorageService.deleteUserTeam.mockClear();
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
  });

  it('when got message without json or number inside, return error', async () => {
    const msgMock = {
      chat: {
        id: KILZI_CHAT_ID,
      },
      text: 'Hello',
    };

    await handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Invalid JSON format. Please send valid JSON.'
    );
    expect(mockSendLogMessage).toHaveBeenCalledTimes(
      timesCalledSendLogMessageInMessageHandler + 1
    );
    expect(mockSendLogMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining(
        `Failed to parse JSON data: ${msgMock.text}. Error:`
      )
    );
  });

  it('should handle /help command and send help message', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_HELP,
    };

    await handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining('*Available Commands:*'),
      { parse_mode: 'Markdown' }
    );
  });

  it('should handle /reset_cache command and send reset confirmation', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_RESET_CACHE,
    };

    // Set up cache before resetting
    driversCache[KILZI_CHAT_ID] = { some: 'data' };
    constructorsCache[KILZI_CHAT_ID] = { some: 'data' };
    currentTeamCache[KILZI_CHAT_ID] = { some: 'data' };
    bestTeamsCache[KILZI_CHAT_ID] = { some: 'data' };
    selectedChipCache[KILZI_CHAT_ID] = 'some_chip';

    await handleMessage(botMock, msgMock);

    // Verify Azure Storage team was deleted
    expect(azureStorageService.deleteUserTeam).toHaveBeenCalledWith(
      expect.any(Object), // mockBot
      KILZI_CHAT_ID
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Cache has been reset for your chat.'
    );
    expect(driversCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(constructorsCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(currentTeamCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(bestTeamsCache[KILZI_CHAT_ID]).toBeUndefined();
    expect(selectedChipCache[KILZI_CHAT_ID]).toBeUndefined();
  });

  it('should handle /print_cache command and send cache messages', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_PRINT_CACHE,
    };

    // Set up cache before resetting
    driversCache[KILZI_CHAT_ID] = { some: 'data' };
    constructorsCache[KILZI_CHAT_ID] = { some: 'data' };
    currentTeamCache[KILZI_CHAT_ID] = { some: 'data' };

    await handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should handle /best_teams command and send missing cache message if no cache', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_BEST_TEAMS,
    };

    await handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should handle number message and send no cached teams message if no cache', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '1',
    };

    await handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining('No cached teams available')
    );
  });

  it('should handle invalid JSON and send error', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '{invalidJson:}',
    };

    await handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Invalid JSON format. Please send valid JSON.'
    );
    expect(mockSendLogMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining('Failed to parse JSON data')
    );
  });

  it('should store JSON data and save to Azure Storage when validation passes', async () => {
    const jsonData = {
      Drivers: [
        { DR: 'VER', price: 30.5 },
        { DR: 'HAM', price: 25.0 },
      ],
      Constructors: [
        { CN: 'RBR', price: 20.0 },
        { CN: 'MER', price: 15.0 },
      ],
      CurrentTeam: {
        drivers: ['VER', 'HAM'],
        constructors: ['RBR', 'MER'],
        costCapRemaining: 3.5,
      },
    };

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: JSON.stringify(jsonData),
    };

    await handleMessage(botMock, msgMock);

    // Verify data was stored in cache
    expect(driversCache[KILZI_CHAT_ID]).toBeDefined();
    expect(constructorsCache[KILZI_CHAT_ID]).toBeDefined();
    expect(currentTeamCache[KILZI_CHAT_ID]).toEqual(jsonData.CurrentTeam);

    // Verify team was saved to Azure Storage
    expect(azureStorageService.saveUserTeam).toHaveBeenCalledWith(
      expect.any(Object), // mockBot
      KILZI_CHAT_ID,
      jsonData.CurrentTeam
    );
  });

  it('should calculate and send current team info correctly', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_CURRENT_TEAM_BUDGET,
    };

    // Setup mock cache data
    driversCache[KILZI_CHAT_ID] = {
      VER: { price: 30.5, expectedPoints: 30, expectedPriceChange: 1 },
      HAM: { price: 25.0, expectedPoints: 20, expectedPriceChange: 1 },
    };
    constructorsCache[KILZI_CHAT_ID] = {
      RBR: { price: 20.0, expectedPoints: 30, expectedPriceChange: 1 },
      MER: { price: 15.0, expectedPoints: 30, expectedPriceChange: 1 },
    };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: ['VER', 'HAM'],
      constructors: ['RBR', 'MER'],
      costCapRemaining: 3.5,
    };

    const expectedTotalPrice = 30.5 + 25.0 + 20.0 + 15.0; // 90.5
    const expectedCostCap = 3.5;
    const expectedBudget = expectedTotalPrice + expectedCostCap; // 94.0
    const expectedPoints = 30 + 20 + 30 + 30; // 110
    const expectedPriceChange = 1 + 1 + 1 + 1; // 4

    // Mock the calculateTeamInfo function
    mockCalculateTeamInfo.mockReturnValue({
      totalPrice: expectedTotalPrice,
      costCapRemaining: expectedCostCap,
      overallBudget: expectedBudget,
      teamExpectedPoints: expectedPoints,
      teamPriceChange: expectedPriceChange,
    });

    await handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining(`*Current Team Info:*`),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining(
        `*Drivers & Constructors Total Price:* ${expectedTotalPrice.toFixed(2)}`
      ),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining(
        `*Cost Cap Remaining:* ${expectedCostCap.toFixed(2)}`
      ),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining(`*Total Budget:* ${expectedBudget.toFixed(2)}`),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining(`*Expected Points:* ${expectedPoints}`),
      { parse_mode: 'Markdown' }
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining(
        `*Expected Price Change:* ${expectedPriceChange}`
      ),
      { parse_mode: 'Markdown' }
    );
  });

  it('should send missing cache message if drivers cache is missing', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_CURRENT_TEAM_BUDGET,
    };
    // Only constructors and currentTeam set
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: [],
      constructors: [],
      costCapRemaining: 0,
    };

    await handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should send missing cache message if constructors cache is missing', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_CURRENT_TEAM_BUDGET,
    };
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: [],
      constructors: [],
      costCapRemaining: 0,
    };

    await handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should send missing cache message if current team cache is missing', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_CURRENT_TEAM_BUDGET,
    };
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };

    await handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should send formatted command list if user is admin', async () => {
    mockIsAdmin.mockReturnValueOnce(true);
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_GET_BOTFATHER_COMMANDS,
    };

    const expectedBotFatherCommands = USER_COMMANDS_CONFIG.map(
      (cmd) => `${cmd.constant.substring(1)} - ${cmd.description}`
    ).join('\n');

    await handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expectedBotFatherCommands
    );
    expect(mockIsAdmin).toHaveBeenCalledWith(msgMock);
  });
});

describe('handleNextRaceInfoCommand', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete nextRaceInfoCache.defaultSharedKey;
    Object.keys(weatherForecastCache).forEach(
      (key) => delete weatherForecastCache[key]
    );
  });

  it('should handle unavailable next race info', async () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_NEXT_RACE_INFO,
    };

    await handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      'Next race information is currently unavailable.'
    );
  });

  it('should display next race info with weather forecast when available and log location', async () => {
    const mockNextRaceInfo = {
      circuitName: 'Circuit de Monaco',
      location: {
        lat: '43.7347',
        long: '7.42056',
        locality: 'Monte-Carlo',
        country: 'Monaco',
      },
      sessions: {
        qualifying: '2025-05-24T14:00:00Z',
        race: '2025-05-25T13:00:00Z',
      },
      weekendFormat: 'regular',
      historicalData: [
        {
          season: 2024,
          winner: 'Charles Leclerc',
          constructor: 'Ferrari',
          carsFinished: 16,
        },
        {
          season: 2023,
          winner: 'Max Verstappen',
          constructor: 'Red Bull',
          carsFinished: 19,
        },
      ],
    };

    // Mock weather forecasts
    const qualifyingDate = new Date('2025-05-24T14:00:00Z');
    const raceDate = new Date('2025-05-25T13:00:00Z');
    getWeatherForecast.mockResolvedValue({
      [qualifyingDate.toISOString()]: {
        temperature: 22.5,
        precipitation: 30,
        wind: 15.2,
      },
      [raceDate.toISOString()]: {
        temperature: 24.0,
        precipitation: 10,
        wind: 12.5,
      },
    });

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_NEXT_RACE_INFO,
    };

    await handleMessage(botMock, msgMock);

    const expectedMessage =
      `*Next Race Information*\n\n` +
      `🏁 *Track:* Circuit de Monaco\n` +
      `📍 *Location:* Monte-Carlo, Monaco\n` +
      `📅 *Qualifying Date:* Saturday, 24 May 2025\n` +
      `⏰ *Qualifying Time:* 17:00 GMT+3\n` +
      `📅 *Race Date:* Sunday, 25 May 2025\n` +
      `⏰ *Race Time:* 16:00 GMT+3\n` +
      `📝 *Weekend Format:* Regular\n\n` +
      `*Weather Forecast:*\n` +
      `*Qualifying:*\n🌡️ Temp: 22.5°C\n🌧️ Rain: 30%\n💨 Wind: 15.2 km/h\n` +
      `*Race:*\n🌡️ Temp: 24°C\n🌧️ Rain: 10%\n💨 Wind: 12.5 km/h\n\n` +
      `*Historical Data (Last Decade):*\n` +
      `*2024:*\n🏆 Winner: Charles Leclerc (Ferrari)\n🏎️ Cars Finished: 16\n\n` +
      `*2023:*\n🏆 Winner: Max Verstappen (Red Bull)\n🏎️ Cars Finished: 19\n\n`;

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedMessage,
      { parse_mode: 'Markdown' }
    );

    // Verify weather API was called with correct parameters
    expect(getWeatherForecast).toHaveBeenCalledWith(
      '43.7347',
      '7.42056',
      qualifyingDate,
      raceDate
    );

    // Verify log message for location
    expect(mockSendLogMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining(
        'Weather forecast fetched for location: Monte-Carlo, Monaco'
      )
    );
  });

  it('should display next race info with sprint sessions and weather for sprint weekend', async () => {
    const mockNextRaceInfo = {
      circuitName: 'Silverstone Circuit',
      location: {
        lat: '52.0786',
        long: '-1.0169',
        locality: 'Silverstone',
        country: 'UK',
      },
      sessions: {
        sprintQualifying: '2025-07-05T14:00:00Z',
        sprint: '2025-07-05T18:00:00Z',
        qualifying: '2025-07-04T16:00:00Z',
        race: '2025-07-06T14:00:00Z',
      },
      weekendFormat: 'sprint',
      historicalData: [
        {
          season: 2024,
          winner: 'Lewis Hamilton',
          constructor: 'Mercedes',
          carsFinished: 18,
        },
        {
          season: 2023,
          winner: 'Max Verstappen',
          constructor: 'Red Bull',
          carsFinished: 20,
        },
      ],
    };

    const sprintQualifyingDate = new Date('2025-07-05T14:00:00Z');
    const sprintDate = new Date('2025-07-05T18:00:00Z');
    const qualifyingDate = new Date('2025-07-04T16:00:00Z');
    const raceDate = new Date('2025-07-06T14:00:00Z');

    getWeatherForecast.mockResolvedValue({
      [sprintQualifyingDate.toISOString()]: {
        temperature: 20,
        precipitation: 10,
        wind: 8,
      },
      [sprintDate.toISOString()]: {
        temperature: 22,
        precipitation: 5,
        wind: 10,
      },
      [qualifyingDate.toISOString()]: {
        temperature: 19,
        precipitation: 15,
        wind: 7,
      },
      [raceDate.toISOString()]: {
        temperature: 23,
        precipitation: 0,
        wind: 12,
      },
    });

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_NEXT_RACE_INFO,
    };

    await handleMessage(botMock, msgMock);

    const expectedMessage =
      `*Next Race Information*\n\n` +
      `🏁 *Track:* Silverstone Circuit\n` +
      `📍 *Location:* Silverstone, UK\n` +
      `📅 *Sprint Qualifying Date:* Saturday, 5 July 2025\n` +
      `⏰ *Sprint Qualifying Time:* 17:00 GMT+3\n` +
      `📅 *Sprint Date:* Saturday, 5 July 2025\n` +
      `⏰ *Sprint Time:* 21:00 GMT+3\n` +
      `📅 *Qualifying Date:* Friday, 4 July 2025\n` +
      `⏰ *Qualifying Time:* 19:00 GMT+3\n` +
      `📅 *Race Date:* Sunday, 6 July 2025\n` +
      `⏰ *Race Time:* 17:00 GMT+3\n` +
      `📝 *Weekend Format:* Sprint\n\n` +
      `*Weather Forecast:*\n` +
      `*Sprint Qualifying:*\n🌡️ Temp: 20°C\n🌧️ Rain: 10%\n💨 Wind: 8 km/h\n` +
      `*Sprint:*\n🌡️ Temp: 22°C\n🌧️ Rain: 5%\n💨 Wind: 10 km/h\n` +
      `*Qualifying:*\n🌡️ Temp: 19°C\n🌧️ Rain: 15%\n💨 Wind: 7 km/h\n` +
      `*Race:*\n🌡️ Temp: 23°C\n🌧️ Rain: 0%\n💨 Wind: 12 km/h\n\n` +
      `*Historical Data (Last Decade):*\n` +
      `*2024:*\n🏆 Winner: Lewis Hamilton (Mercedes)\n🏎️ Cars Finished: 18\n\n` +
      `*2023:*\n🏆 Winner: Max Verstappen (Red Bull)\n🏎️ Cars Finished: 20\n\n`;

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedMessage,
      { parse_mode: 'Markdown' }
    );

    expect(getWeatherForecast).toHaveBeenCalledWith(
      '52.0786',
      '-1.0169',
      qualifyingDate,
      raceDate,
      sprintQualifyingDate,
      sprintDate
    );
  });

  it('should include safety cars and red flags in historical data if present', async () => {
    const mockNextRaceInfo = {
      circuitName: 'Test Circuit',
      location: {
        lat: '0',
        long: '0',
        locality: 'Testville',
        country: 'Testland',
      },
      sessions: {
        qualifying: '2025-01-01T10:00:00Z',
        race: '2025-01-02T10:00:00Z',
      },
      weekendFormat: 'regular',
      historicalData: [
        {
          season: 2025,
          winner: 'Test Winner',
          carsFinished: 15,
          safetyCars: 2,
          redFlags: 1,
        },
        {
          season: 2024,
          winner: 'Another Winner',
          carsFinished: 18,
          // no safetyCars or redFlags
        },
      ],
    };

    const qualifyingDate = new Date('2025-01-01T10:00:00Z');
    const raceDate = new Date('2025-01-02T10:00:00Z');
    getWeatherForecast.mockResolvedValue({
      [qualifyingDate.toISOString()]: {
        temperature: 20,
        precipitation: 10,
        wind: 5,
      },
      [raceDate.toISOString()]: {
        temperature: 22,
        precipitation: 0,
        wind: 7,
      },
    });

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_NEXT_RACE_INFO,
    };

    await handleMessage(botMock, msgMock);

    // Find the message containing historical data
    const sentMessages = botMock.sendMessage.mock.calls.map((call) => call[1]);
    const historicalSection = sentMessages.find((m) =>
      m.includes('*Historical Data (Last Decade):*')
    );

    expect(historicalSection).toContain('*2025:*');
    expect(historicalSection).toContain('🏆 Winner: Test Winner');
    expect(historicalSection).toContain('🏎️ Cars Finished: 15');
    expect(historicalSection).toContain('⚠️🚓 Safety Cars: 2');
    expect(historicalSection).toContain('🚩 Red Flags: 1');

    expect(historicalSection).toContain('*2024:*');
    expect(historicalSection).toContain('🏆 Winner: Another Winner');
    expect(historicalSection).toContain('🏎️ Cars Finished: 18');
    // Extract just the 2024 entry and check it does not contain the new fields
    const entry2024 = historicalSection.split('*2024:*')[1].split('*')[0];
    expect(entry2024).not.toContain('⚠️🚓 Safety Cars:');
    expect(entry2024).not.toContain('🚩 Red Flags:');
  });

  it('should use cached weather forecast if available and not call getWeatherForecast again', async () => {
    const mockNextRaceInfo = {
      circuitName: 'Circuit de Monaco',
      location: {
        lat: '43.7347',
        long: '7.42056',
        locality: 'Monte-Carlo',
        country: 'Monaco',
      },
      sessions: {
        qualifying: '2025-05-24T14:00:00Z',
        race: '2025-05-25T13:00:00Z',
      },
      weekendFormat: 'regular',
      historicalData: [],
    };

    weatherForecastCache.qualifyingWeather = {
      temperature: 20,
      precipitation: 5,
      wind: 10,
    };
    weatherForecastCache.raceWeather = {
      temperature: 21,
      precipitation: 10,
      wind: 12,
    };

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_NEXT_RACE_INFO,
    };

    await handleMessage(botMock, msgMock);

    expect(getWeatherForecast).not.toHaveBeenCalled();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('🌡️ Temp: 20°C'),
      expect.any(Object)
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('🌡️ Temp: 21°C'),
      expect.any(Object)
    );
    // Should not log fetching for location again
    expect(mockSendLogMessage).not.toHaveBeenCalledWith(
      botMock,
      expect.stringContaining('Weather forecast fetched for location:')
    );
  });

  it('should handle weather API errors gracefully', async () => {
    const mockNextRaceInfo = {
      circuitName: 'Circuit de Monaco',
      location: {
        lat: '43.7347',
        long: '7.42056',
        locality: 'Monte-Carlo',
        country: 'Monaco',
      },
      sessions: {
        qualifying: '2025-05-24T14:00:00Z',
        race: '2025-05-25T13:00:00Z',
      },
      weekendFormat: 'regular',
      historicalData: [],
    };

    nextRaceInfoCache.defaultSharedKey = mockNextRaceInfo;

    // Mock weather API to throw an error
    getWeatherForecast.mockRejectedValue(new Error('API error'));

    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_NEXT_RACE_INFO,
    };

    await handleMessage(botMock, msgMock);

    expect(mockSendLogMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining(`Weather API error:`)
    );
  });
});
