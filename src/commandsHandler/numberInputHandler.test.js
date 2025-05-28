const { KILZI_CHAT_ID, COMMAND_BEST_TEAMS } = require('../constants');

const { calculateChangesToTeam } = require('../bestTeamsCalculator');
jest.mock('../bestTeamsCalculator', () => ({
  calculateChangesToTeam: jest.fn(),
}));

const {
  bestTeamsCache,
  driversCache,
  constructorsCache,
  selectedChipCache,
  sharedKey,
} = require('../cache');

const { handleNumberMessage } = require('./numberInputHandler');

describe('handleNumberMessage', () => {
  const botMock = {
    sendMessage: jest.fn().mockResolvedValue(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete bestTeamsCache[KILZI_CHAT_ID];
    delete driversCache[KILZI_CHAT_ID];
    delete constructorsCache[KILZI_CHAT_ID];
    delete selectedChipCache[KILZI_CHAT_ID];
  });

  it('should handle number message and send no cached teams message if no cache', async () => {
    await handleNumberMessage(botMock, KILZI_CHAT_ID, '1');

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining('No cached teams available')
    );
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining(
        `Please send full JSON data or images first and then run the ${COMMAND_BEST_TEAMS} command`
      )
    );
  });

  it('should send "no team found" message when requested team number does not exist', async () => {
    const teamRowRequested = 5;

    bestTeamsCache[KILZI_CHAT_ID] = {
      currentTeam: { drivers: [], constructors: [] },
      bestTeams: [
        { row: 1, transfers_needed: 2 },
        { row: 2, transfers_needed: 1 },
      ],
    };

    await handleNumberMessage(
      botMock,
      KILZI_CHAT_ID,
      teamRowRequested.toString()
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `No team found for number ${teamRowRequested}.`
    );
  });

  it('should send "no changes needed" message when team is current and no extra DRS', async () => {
    const teamRowRequested = 1;

    bestTeamsCache[KILZI_CHAT_ID] = {
      currentTeam: { drivers: [], constructors: [] },
      bestTeams: [
        {
          row: 1,
          transfers_needed: 0,
          extra_drs_driver: null, // no extra DRS
        },
      ],
    };

    await handleNumberMessage(
      botMock,
      KILZI_CHAT_ID,
      teamRowRequested.toString()
    );

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      `You are already at team ${teamRowRequested}. No changes needed.`
    );
  });

  it('should calculate and show changes when team requires transfers', async () => {
    const teamRowRequested = 2;
    const mockCurrentTeam = { drivers: ['VER'], constructors: ['RBR'] };
    const mockSelectedTeam = {
      row: 2,
      transfers_needed: 2,
      extra_drs_driver: null,
    };

    bestTeamsCache[KILZI_CHAT_ID] = {
      currentTeam: mockCurrentTeam,
      bestTeams: [mockSelectedTeam],
    };

    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };
    selectedChipCache[KILZI_CHAT_ID] = 'LIMITLESS_CHIP';

    const mockChanges = {
      driversToAdd: ['HAM'],
      driversToRemove: ['VER'],
      constructorsToAdd: ['MER'],
      constructorsToRemove: ['RBR'],
      extraDrsDriver: null,
      newDRS: 'HAM',
      chipToActivate: 'LIMITLESS_CHIP',
      deltaPoints: 10.5,
      deltaPrice: -2.3,
    };

    calculateChangesToTeam.mockReturnValue(mockChanges);

    await handleNumberMessage(
      botMock,
      KILZI_CHAT_ID,
      teamRowRequested.toString()
    );

    expect(calculateChangesToTeam).toHaveBeenCalledWith(
      {
        Drivers: driversCache[KILZI_CHAT_ID],
        Constructors: constructorsCache[KILZI_CHAT_ID],
        CurrentTeam: mockCurrentTeam,
      },
      mockSelectedTeam,
      'LIMITLESS_CHIP'
    );

    const expectedMessage =
      `*Team ${teamRowRequested} Required Changes:*\n` +
      `*Drivers To Add:* HAM\n` +
      `*Drivers To Remove:* VER\n` +
      `*Constructors To Add:* MER\n` +
      `*Constructors To Remove:* RBR\n` +
      `*New DRS Driver:* HAM\n` +
      `*Chip To Activate:* LIMITLESS CHIP\n` +
      `*Δ Points:* +10.50\n` +
      `*Δ Price:* -2.30M`;

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedMessage,
      { parse_mode: 'Markdown' }
    );
  });

  it('should show extra DRS driver when present', async () => {
    const teamRowRequested = 1;
    const mockCurrentTeam = { drivers: ['VER'], constructors: ['RBR'] };
    const mockSelectedTeam = {
      row: 1,
      transfers_needed: 0,
      extra_drs_driver: 'HAM', // has extra DRS
    };

    bestTeamsCache[KILZI_CHAT_ID] = {
      currentTeam: mockCurrentTeam,
      bestTeams: [mockSelectedTeam],
    };

    driversCache[KILZI_CHAT_ID] = { VER: { price: 30.5 } };
    constructorsCache[KILZI_CHAT_ID] = { RBR: { price: 20.0 } };

    const mockChanges = {
      driversToAdd: [],
      driversToRemove: [],
      constructorsToAdd: [],
      constructorsToRemove: [],
      extraDrsDriver: 'HAM',
      newDRS: 'VER',
      deltaPoints: 5.0,
      deltaPrice: 0,
    };

    calculateChangesToTeam.mockReturnValue(mockChanges);

    await handleNumberMessage(
      botMock,
      KILZI_CHAT_ID,
      teamRowRequested.toString()
    );

    const expectedMessage =
      `*Team ${teamRowRequested} Required Changes:*\n` +
      `*Extra DRS Driver:* HAM\n` +
      `*DRS Driver:* VER\n` +
      `*Δ Points:* +5.00\n` +
      `*Δ Price:* 0.00M`;

    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expectedMessage,
      { parse_mode: 'Markdown' }
    );
  });

  it('should use shared cache when chat-specific cache is not available', async () => {
    const teamRowRequested = 1;
    const mockCurrentTeam = { drivers: ['VER'], constructors: ['RBR'] };
    const mockSelectedTeam = {
      row: 1,
      transfers_needed: 1,
    };

    bestTeamsCache[KILZI_CHAT_ID] = {
      currentTeam: mockCurrentTeam,
      bestTeams: [mockSelectedTeam],
    };

    // Set shared cache instead of chat-specific
    driversCache[sharedKey] = { VER: { price: 30.5 } };
    constructorsCache[sharedKey] = { RBR: { price: 20.0 } };

    const mockChanges = {
      driversToAdd: [],
      driversToRemove: [],
      constructorsToAdd: [],
      constructorsToRemove: [],
      deltaPoints: 0,
      deltaPrice: 0,
    };

    calculateChangesToTeam.mockReturnValue(mockChanges);

    await handleNumberMessage(
      botMock,
      KILZI_CHAT_ID,
      teamRowRequested.toString()
    );

    expect(calculateChangesToTeam).toHaveBeenCalledWith(
      {
        Drivers: driversCache[sharedKey],
        Constructors: constructorsCache[sharedKey],
        CurrentTeam: mockCurrentTeam,
      },
      mockSelectedTeam,
      undefined
    );
  });
});
