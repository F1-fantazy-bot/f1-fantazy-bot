const {
  KILZI_CHAT_ID,
  COMMAND_BEST_TEAMS,
  COMMAND_CURRENT_TEAM_BUDGET,
  COMMAND_PRINT_CACHE,
  COMMAND_RESET_CACHE,
  COMMAND_HELP,
} = require('./constants');

const mockIsAdmin = jest.fn().mockReturnValue(true);
const mockGetChatName = jest.fn().mockReturnValue('Unknown');
const mockSendLogMessage = jest.fn();
const mockCalculateTeamBudget = jest.fn();

jest.mock('./utils/utils', () => ({
  getChatName: mockGetChatName,
  sendLogMessage: mockSendLogMessage,
  calculateTeamBudget: mockCalculateTeamBudget,
  isAdminMessage: mockIsAdmin,
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
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
  });

  it('when got message without json or number inside, return error', () => {
    const msgMock = {
      chat: {
        id: KILZI_CHAT_ID,
      },
      text: 'Hello',
    };

    handleMessage(botMock, msgMock);
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

  it('should handle /help command and send help message', () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_HELP,
    };

    handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining('*Available Commands:*'),
      { parse_mode: 'Markdown' }
    );
  });

  it('should handle /reset_cache command and send reset confirmation', () => {
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

    handleMessage(botMock, msgMock);

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

  it('should handle /print_cache command and send cache messages', () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_PRINT_CACHE,
    };

    // Set up cache before resetting
    driversCache[KILZI_CHAT_ID] = { some: 'data' };
    constructorsCache[KILZI_CHAT_ID] = { some: 'data' };
    currentTeamCache[KILZI_CHAT_ID] = { some: 'data' };

    handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('should handle /best_teams command and send missing cache message if no cache', () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_BEST_TEAMS,
    };

    handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should handle number message and send no cached teams message if no cache', () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '1',
    };

    handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining('No cached teams available')
    );
  });

  it('should handle invalid JSON and send error', () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: '{invalidJson:}',
    };

    handleMessage(botMock, msgMock);
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Invalid JSON format. Please send valid JSON.'
    );
    expect(mockSendLogMessage).toHaveBeenCalledWith(
      botMock,
      expect.stringContaining('Failed to parse JSON data')
    );
  });

  it('should calculate and send current team budget correctly', () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_CURRENT_TEAM_BUDGET,
    };

    // Setup mock cache data
    driversCache[KILZI_CHAT_ID] = {
      VER: { price: 30.5 },
      HAM: { price: 25.0 },
    };
    constructorsCache[KILZI_CHAT_ID] = {
      RBR: { price: 20.0 },
      MER: { price: 15.0 },
    };
    currentTeamCache[KILZI_CHAT_ID] = {
      drivers: ['VER', 'HAM'],
      constructors: ['RBR', 'MER'],
      costCapRemaining: 3.5,
    };

    const expectedTotalPrice = 30.5 + 25.0 + 20.0 + 15.0; // 90.5
    const expectedCostCap = 3.5;
    const expectedBudget = expectedTotalPrice + expectedCostCap; // 94.0

    // Mock the calculateTeamBudget function
    mockCalculateTeamBudget.mockReturnValue({
      totalPrice: expectedTotalPrice,
      costCapRemaining: expectedCostCap,
      overallBudget: expectedBudget,
    });

    handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      expect.stringContaining(`*Current Team Budget Calculation:*`),
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
  });

  it('should send missing cache message if drivers cache is missing', () => {
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

    handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should send missing cache message if constructors cache is missing', () => {
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

    handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });

  it('should send missing cache message if current team cache is missing', () => {
    const msgMock = {
      chat: { id: KILZI_CHAT_ID },
      text: COMMAND_CURRENT_TEAM_BUDGET,
    };
    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };

    handleMessage(botMock, msgMock);

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      msgMock.chat.id,
      'Missing cached data. Please send images or JSON data for drivers, constructors, and current team first.'
    );
  });
});
