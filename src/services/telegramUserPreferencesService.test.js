jest.mock('./setLanguageService', () => ({
  refreshLanguagePreference: jest.fn(),
}));
jest.mock('./selectTeamService', () => ({
  refreshSelectedTeamPreference: jest.fn(),
}));
jest.mock('./setBestTeamRankingService', () => ({
  refreshBestTeamRankingPreferences: jest.fn(),
}));
jest.mock('./activateChipService', () => ({
  refreshChipPreferences: jest.fn(),
}));

const {
  refreshLanguagePreference,
} = require('./setLanguageService');
const {
  refreshSelectedTeamPreference,
} = require('./selectTeamService');
const {
  refreshBestTeamRankingPreferences,
} = require('./setBestTeamRankingService');
const {
  refreshChipPreferences,
} = require('./activateChipService');
const {
  refreshTelegramUserPreferences,
} = require('./telegramUserPreferencesService');

test('refreshes language, selected team, ranking, and chips concurrently', async () => {
  let resolveLanguage;
  let resolveTeam;
  let resolveRanking;
  let resolveChips;
  refreshLanguagePreference.mockReturnValue(
    new Promise((resolve) => {
      resolveLanguage = resolve;
    }),
  );
  refreshSelectedTeamPreference.mockReturnValue(
    new Promise((resolve) => {
      resolveTeam = resolve;
    }),
  );
  refreshBestTeamRankingPreferences.mockReturnValue(
    new Promise((resolve) => {
      resolveRanking = resolve;
    }),
  );
  refreshChipPreferences.mockReturnValue(
    new Promise((resolve) => {
      resolveChips = resolve;
    }),
  );

  const refresh = refreshTelegramUserPreferences(42);
  expect(refreshLanguagePreference).toHaveBeenCalledWith(42);
  expect(refreshSelectedTeamPreference).toHaveBeenCalledWith(42);
  expect(refreshBestTeamRankingPreferences).toHaveBeenCalledWith(42);
  expect(refreshChipPreferences).toHaveBeenCalledWith(42);
  resolveLanguage(true);
  resolveTeam({ fresh: true, selectedTeam: 'T2' });
  resolveRanking({ fresh: true, preferences: { T2: 1.65 } });
  resolveChips({ fresh: true, chips: { T2: 'EXTRA_BOOST' } });

  await expect(refresh).resolves.toBeUndefined();
});
