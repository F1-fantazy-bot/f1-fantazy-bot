jest.mock('@copilotkit/runtime/v2', () => ({ defineTool: (spec) => spec }));
jest.mock('./cacheBootstrap', () => ({ ensureCacheReady: jest.fn() }));
jest.mock('./identity', () => ({ getAgentChatId: () => 42 }));
jest.mock('../leagueRegistryService', () => ({ listUserLeagues: jest.fn() }));
jest.mock('../azureStorageService', () => ({ getLeagueData: jest.fn() }));
jest.mock('../raceScheduleService', () => ({ fetchCurrentSeasonRaces: jest.fn() }));
jest.mock('../services/setLanguageService', () => ({ getFreshLanguagePreference: jest.fn() }));
const { tools } = require('./tools');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const { getFreshLanguagePreference } = require('../services/setLanguageService');
const leaderboard = tools.find((tool) => tool.name === 'get_leaderboard');
const choices = tools.find((tool) => tool.name === 'get_action_choices');
beforeEach(() => {
  jest.clearAllMocks();
  listUserLeagues.mockResolvedValue([{ leagueCode: 'C7', leagueName: 'League' }]);
  getFreshLanguagePreference.mockResolvedValue({ lang: 'en' });
  getLeagueData.mockResolvedValue({ teams: [{ totalScore: 1234, raceScores: { matchday_10: 20, matchday_2: 5 } }] });
  fetchCurrentSeasonRaces.mockResolvedValue({ MRData: { RaceTable: { Races: [
    { round: '10', raceName: 'Austrian Grand Prix', Circuit: { Location: { country: 'Austria' } } }, { round: '2', raceName: 'Australian Grand Prix', Circuit: { Location: { country: 'Australia' } } },
  ] } } });
});
test.each(['en', 'he'])('league → period → race or season in %s', async (lang) => {
  getFreshLanguagePreference.mockResolvedValue({ lang });
  const leagues = await leaderboard.execute({});
  expect(leagues.choice).toBe('league');
  expect(getLeagueData).not.toHaveBeenCalled();
  const periods = await leaderboard.execute(leagues.options[0].args);
  expect(periods).toMatchObject({ status: 'selection_required', choice: 'period', lang });
  expect(periods.options.map((option) => option.label)).toEqual([lang === 'he' ? 'כל העונה' : 'Entire season', '🇦🇹 Austrian GP', '🇦🇺 Australian GP']);
  for (const [index, totalScore] of [[0, 1234], [1, 20], [2, 5]]) {
    const table = await leaderboard.execute(periods.options[index].args);
    expect(table).toMatchObject({ status: 'ok', period: index ? 'race' : 'season', lang, standings: [{ totalScore }] });
    if (index) {
      expect(table.raceFlag).toBe(index === 1 ? '🇦🇹' : '🇦🇺');
    }
  }
});
test.each([{ period: 'season' }, { period: 'race', matchdayId: 10 }, { raceName: 'Austrian Grand Prix' }])('preserves explicit arguments through league choice %j', async (args) => {
  const leagues = await leaderboard.execute(args);
  expect(leagues.options[0].args).toMatchObject(args);
  const result = await leaderboard.execute(leagues.options[0].args);
  expect(result.status).toBe('ok');
  expect(result.period).toBe(args.period === 'season' ? 'season' : 'race');
});
test('ambiguous race choices retain the league and replace the ambiguous name', async () => {
  const result = await leaderboard.execute({ leagueCode: 'C7', raceName: 'Austr' });
  expect(result.choice).toBe('period');
  expect(result.options.map((option) => option.args.matchdayId)).toEqual([10, 2]);
  expect(result.options[0].args.raceName).toBeUndefined();
  expect(await leaderboard.execute(result.options[0].args)).toMatchObject({ status: 'ok', matchdayId: 10 });
});
test('direct period discovery supports league continuation and race-only choices', async () => {
  const leagues = await choices.execute({ action: 'get_leaderboard', choice: 'period', context: { period: 'race' } });
  expect(leagues.choice).toBe('league');
  const races = await choices.execute({ action: 'get_leaderboard', choice: 'period', context: leagues.options[0].args });
  expect(races.options.map((option) => option.label)).toEqual(['🇦🇹 Austrian GP', '🇦🇺 Australian GP']);
});
test('unavailable race and unauthorized requests cannot return season standings or private data', async () => {
  expect(await leaderboard.execute({ leagueCode: 'C7', matchdayId: 99 })).toMatchObject({ status: 'race_unavailable' });
  getLeagueData.mockClear();
  fetchCurrentSeasonRaces.mockClear();
  for (const invoke of [
    () => leaderboard.execute({ leagueCode: 'FOREIGN', matchdayId: 10 }),
    () => choices.execute({ action: 'get_leaderboard', choice: 'period', context: { leagueCode: 'FOREIGN' } }),
  ]) {expect(await invoke()).toMatchObject({ status: 'not_followed' });}
  expect(getLeagueData).not.toHaveBeenCalled();
  expect(fetchCurrentSeasonRaces).not.toHaveBeenCalled();
});


test('nullable unspecified period fields become genuine omissions through league continuation', async () => {
  const result = await leaderboard.execute({ leagueCode: null, period: null, matchdayId: null, raceName: null });
  expect(result.choice).toBe('league');
  expect(result.options[0].args).toEqual({ leagueCode: 'C7', leagueName: undefined });
  expect(await leaderboard.execute(result.options[0].args)).toMatchObject({ status: 'selection_required', choice: 'period' });
});
