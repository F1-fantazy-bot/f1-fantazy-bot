const { KILZI_CHAT_ID, EXTRA_BOOST_CHIP, WILDCARD_CHIP, WITHOUT_CHIP } = require('../constants');
const { updateUserAttributes } = require('../userRegistryService');
jest.mock('../userRegistryService', () => ({
  updateUserAttributes: jest.fn().mockResolvedValue(undefined),
}));
const {
  bestTeamsCache,
  selectedChipCache,
  currentTeamCache,
  userCache,
} = require('../cache');
const { handleSelectExtraBoost, handleResetChip } = require('./selectChipHandlers');

describe('select chip handlers', () => {
  const botMock = { sendMessage: jest.fn().mockResolvedValue() };
  const TEAM_ID = 'T1';

  beforeEach(() => {
    jest.clearAllMocks();
    delete bestTeamsCache[KILZI_CHAT_ID];
    delete selectedChipCache[KILZI_CHAT_ID];
    delete currentTeamCache[KILZI_CHAT_ID];
    delete userCache[String(KILZI_CHAT_ID)];
    // Set up single team so resolveSelectedTeam auto-resolves to T1
    currentTeamCache[KILZI_CHAT_ID] = { [TEAM_ID]: { drivers: ['VER'] } };
  });

  it('should select EXTRA_BOOST chip and clear bestTeamsCache for team', async () => {
    bestTeamsCache[KILZI_CHAT_ID] = { [TEAM_ID]: { some: 'data' } };
    userCache[String(KILZI_CHAT_ID)] = {
      selectedBestTeamByTeam: {
        [TEAM_ID]: {
          drivers: ['VER', 'HAM', 'NOR', 'LEC', 'PIA'],
          constructors: ['RBR', 'FER'],
          boostDriver: 'VER',
        },
      },
    };

    await handleSelectExtraBoost(botMock, { chat: { id: KILZI_CHAT_ID } });

    expect(selectedChipCache[KILZI_CHAT_ID][TEAM_ID]).toBe(EXTRA_BOOST_CHIP);
    expect(bestTeamsCache[KILZI_CHAT_ID][TEAM_ID]).toBeUndefined();
    expect(updateUserAttributes).toHaveBeenCalledWith(KILZI_CHAT_ID, {
      selectedBestTeamByTeam: null,
    });
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining(`Selected chip: ${EXTRA_BOOST_CHIP}.`)
    );
  });

  it('should reset chip selection', async () => {
    selectedChipCache[KILZI_CHAT_ID] = { [TEAM_ID]: WILDCARD_CHIP };

    await handleResetChip(botMock, { chat: { id: KILZI_CHAT_ID } });

    expect(selectedChipCache[KILZI_CHAT_ID][TEAM_ID]).toBeUndefined();
    expect(botMock.sendMessage).toHaveBeenCalledWith(
      KILZI_CHAT_ID,
      expect.stringContaining(`Selected chip: ${WITHOUT_CHIP}.`)
    );
  });
});
