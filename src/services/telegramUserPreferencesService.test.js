jest.mock('./setLanguageService', () => ({
  refreshLanguagePreference: jest.fn(),
}));
jest.mock('./selectTeamService', () => ({
  refreshSelectedTeamPreference: jest.fn(),
}));

const {
  refreshLanguagePreference,
} = require('./setLanguageService');
const {
  refreshSelectedTeamPreference,
} = require('./selectTeamService');
const {
  refreshTelegramUserPreferences,
} = require('./telegramUserPreferencesService');

test('refreshes language and selected team concurrently', async () => {
  let resolveLanguage;
  let resolveTeam;
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

  const refresh = refreshTelegramUserPreferences(42);
  expect(refreshLanguagePreference).toHaveBeenCalledWith(42);
  expect(refreshSelectedTeamPreference).toHaveBeenCalledWith(42);
  resolveLanguage(true);
  resolveTeam({ fresh: true, selectedTeam: 'T2' });

  await expect(refresh).resolves.toBeUndefined();
});
