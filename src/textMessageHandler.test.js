const {
  KILZI_CHAT_ID,
  COMMAND_BEST_TEAMS,
  COMMAND_CURRENT_TEAM_INFO: COMMAND_CURRENT_TEAM_BUDGET,
  COMMAND_PRINT_CACHE,
  COMMAND_RESET_CACHE,
  COMMAND_HELP,
  COMMAND_GET_BOTFATHER_COMMANDS,
  USER_COMMANDS_CONFIG,
} = require('./constants');

const mockIsAdmin = jest.fn().mockReturnValue(true);
const mockGetChatName = jest.fn().mockReturnValue('Unknown');
const mockSendLogMessage = jest.fn();
const mockCalculateTeamInfo = jest.fn();

const mockValidateJsonData = jest.fn().mockReturnValue(true);

jest.mock('./utils/utils', () => ({
  getChatName: mockGetChatName,
  sendLogMessage: mockSendLogMessage,
  calculateTeamInfo: mockCalculateTeamInfo,
  isAdminMessage: mockIsAdmin,
  validateJsonData: mockValidateJsonData,
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
