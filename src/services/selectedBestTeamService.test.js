jest.mock('../userRegistryService', () => ({
  updateUserAttributesAtomically: jest.fn(),
}));
jest.mock('./setBestTeamRankingService', () => ({
  invalidateBestTeamRankingRefresh: jest.fn(),
}));

const {
  updateUserAttributesAtomically,
} = require('../userRegistryService');
const { userCache } = require('../cache');
const {
  invalidateBestTeamRankingRefresh,
} = require('./setBestTeamRankingService');
const {
  setSelectedBestTeamPreference,
  clearSelectedBestTeamPreference,
  retainSelectedBestTeamPreferences,
} = require('./selectedBestTeamService');

const CHAT_ID = 42;
const selection = {
  drivers: ['VER', 'NOR', 'PIA', 'LEC', 'HAM'],
  constructors: ['MCL', 'FER'],
  boostDriver: 'VER',
};

beforeEach(() => {
  jest.clearAllMocks();
  userCache[String(CHAT_ID)] = {
    selectedBestTeamByTeam: {},
  };
  updateUserAttributesAtomically.mockImplementation(
    async (_chatId, transform) => ({
      updated: true,
      user: await transform({
        selectedBestTeamByTeam: JSON.stringify({
          T1: selection,
          T2: selection,
        }),
      }),
    }),
  );
});

afterEach(() => {
  delete userCache[String(CHAT_ID)];
});

test('sets one team without losing the latest durable entries', async () => {
  await setSelectedBestTeamPreference({
    chatId: CHAT_ID,
    teamId: 'T3',
    selectedBestTeam: selection,
  });

  expect(userCache[String(CHAT_ID)].selectedBestTeamByTeam).toEqual({
    T1: selection,
    T2: selection,
    T3: selection,
  });
  expect(invalidateBestTeamRankingRefresh).toHaveBeenCalledWith(CHAT_ID);
});

test('clears one team and preserves other durable entries atomically', async () => {
  await clearSelectedBestTeamPreference({
    chatId: CHAT_ID,
    teamId: 'T1',
    attributes: { selectedTeam: 'T2' },
  });

  const transform = updateUserAttributesAtomically.mock.calls[0][1];
  expect(
    transform({
      selectedBestTeamByTeam: JSON.stringify({
        T1: selection,
        T2: selection,
      }),
    }),
  ).toEqual({
    selectedTeam: 'T2',
    selectedBestTeamByTeam: JSON.stringify({ T2: selection }),
  });
  expect(userCache[String(CHAT_ID)].selectedBestTeamByTeam).toEqual({
    T2: selection,
  });
});

test('retains selections only for remaining teams', async () => {
  await retainSelectedBestTeamPreferences({
    chatId: CHAT_ID,
    teamIds: ['T2'],
  });

  expect(userCache[String(CHAT_ID)].selectedBestTeamByTeam).toEqual({
    T2: selection,
  });
});
