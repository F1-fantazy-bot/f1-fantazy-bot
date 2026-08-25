jest.mock('openai', () => ({
  AzureOpenAI: jest.fn(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));
jest.mock('../leagueRegistryService', () => ({ listUserLeagues: jest.fn() }));
jest.mock('../azureStorageService', () => ({
  getLeagueData: jest.fn(),
  getLockedTeamsData: jest.fn(),
}));
jest.mock('../raceScheduleService', () => ({
  fetchCurrentSeasonRaces: jest.fn(),
}));
jest.mock('../utils', () => ({
  sendErrorMessage: jest.fn().mockResolvedValue(),
  sendLogMessage: jest.fn().mockResolvedValue(),
}));
jest.mock('../i18n', () => ({
  getLanguage: jest.fn(() => 'en'),
  t: jest.fn((text, _id, params = {}) =>
    Object.entries(params).reduce(
      (result, [key, value]) => result.replace(`{${key}}`, value),
      text,
    ),
  ),
}));

const { AzureOpenAI } = require('openai');
const { listUserLeagues } = require('../leagueRegistryService');
const { getLeagueData, getLockedTeamsData } = require('../azureStorageService');
const { fetchCurrentSeasonRaces } = require('../raceScheduleService');
const {
  buildKeyTeamDifferences,
  buildRaceSummaryData,
  findRaceName,
  sendRaceSummary,
  handleRaceSummaryCommand,
} = require('./raceSummaryHandler');

const fixture = {
  leagueName: 'Fast Friends',
  teams: [
    {
      teamName: 'Rocket',
      position: 1,
      totalScore: 350,
      raceScores: { matchday_1: 100, matchday_2: 250 },
    },
    {
      teamName: 'Turtle',
      position: 2,
      totalScore: 300,
      raceScores: { matchday_1: 200, matchday_2: 100 },
    },
    {
      teamName: 'The Best Bot',
      position: 3,
      totalScore: 999,
      raceScores: { matchday_1: 500, matchday_2: 499 },
    },
  ],
};
const lockedFixture = {
  matchdayId: 2,
  teams: [
    {
      teamName: 'Rocket',
      teamNo: 1,
      drivers: [{ name: 'Alonso' }, { name: 'Norris' }],
      constructors: [{ name: 'McLaren' }],
    },
    {
      teamName: 'Turtle',
      teamNo: 1,
      drivers: [{ name: 'Hamilton' }, { name: 'Norris' }],
      constructors: [{ name: 'Ferrari' }],
    },
  ],
};

const openAiClient = { chat: { completions: { create: jest.fn() } } };
AzureOpenAI.mockImplementation(() => openAiClient);

describe('raceSummaryHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchCurrentSeasonRaces.mockResolvedValue({
      MRData: {
        RaceTable: {
          Races: [{ round: '2', raceName: 'Chinese Grand Prix' }],
        },
      },
    });
  });

  it('finds the race name for a fantasy matchday', () => {
    expect(
      findRaceName(
        { MRData: { RaceTable: { Races: [{ round: '2', raceName: 'China' }] } } },
        2,
      ),
    ).toBe('China');
  });

  it('compares the race winner with second, third, and bottom teams', () => {
    const teams = [
      {
        teamName: 'Winner',
        latestRaceScore: 300,
        drivers: [{ name: 'Alonso' }, { name: 'Norris' }],
        constructors: [{ name: 'McLaren' }],
      },
      {
        teamName: 'Second',
        latestRaceScore: 280,
        drivers: [{ name: 'Hamilton' }, { name: 'Norris' }],
        constructors: [{ name: 'McLaren' }],
      },
      {
        teamName: 'Third',
        latestRaceScore: 260,
        drivers: [{ name: 'Leclerc' }, { name: 'Norris' }],
        constructors: [{ name: 'Ferrari' }],
      },
      {
        teamName: 'Bottom',
        latestRaceScore: 100,
        drivers: [{ name: 'Stroll' }, { name: 'Norris' }],
        constructors: [{ name: 'Aston Martin' }],
      },
    ];

    const differences = buildKeyTeamDifferences(teams);
    expect(differences.map(({ label }) => label)).toEqual([
      'winner_vs_2nd',
      'winner_vs_3rd',
      'top_vs_bottom',
    ]);
    expect(differences[0]).toMatchObject({
      subject: { teamName: 'Winner', uniqueDrivers: ['Alonso'] },
      comparison: { teamName: 'Second', uniqueDrivers: ['Hamilton'] },
      scoreGap: 20,
    });
    expect(differences[2]).toMatchObject({
      comparison: {
        teamName: 'Bottom',
        uniqueDrivers: ['Stroll'],
        uniqueConstructors: ['Aston Martin'],
      },
      scoreGap: 200,
    });
  });

  it('builds latest-race and season movement facts and excludes the graph bot', () => {
    const data = buildRaceSummaryData(fixture, lockedFixture);
    expect(data.latestMatchday).toBe('matchday_2');
    expect(data.raceNumber).toBe(2);
    expect(data.teams.map((team) => team.teamName)).toEqual([
      'Rocket',
      'Turtle',
    ]);
    expect(data.teams[0]).toMatchObject({
      latestRaceScore: 250,
      seasonRankChange: 1,
    });
    expect(data.teams[0]).not.toHaveProperty('previousRaceScore');
    expect(data.teams[1].seasonRankChange).toBe(-1);
    expect(data.keyTeamDifferences[0]).toMatchObject({
      label: 'winner_vs_2nd',
      subject: { teamName: 'Rocket', uniqueDrivers: ['Alonso'] },
      comparison: { teamName: 'Turtle', uniqueDrivers: ['Hamilton'] },
      scoreGap: 150,
    });
  });

  it('asks OpenAI for and sends a generated summary', async () => {
    getLeagueData.mockResolvedValue(fixture);
    getLockedTeamsData.mockResolvedValue(lockedFixture);
    openAiClient.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: '🏁 Rocket wins!' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const bot = { sendMessage: jest.fn().mockResolvedValue() };
    await sendRaceSummary(bot, 42, 'ABC');
    expect(bot.sendMessage).toHaveBeenNthCalledWith(
      1,
      42,
      '🏎️ Creating your race summary... This may take a few seconds.',
    );
    expect(getLeagueData).toHaveBeenCalledWith('ABC');
    expect(getLockedTeamsData).toHaveBeenCalledWith('ABC');
    expect(bot.sendMessage).toHaveBeenCalledWith(42, '🏁 Rocket wins!');
    const request = openAiClient.chat.completions.create.mock.calls[0][0];
    expect(request.model).toBe('gpt-5.6-sol');
    expect(request.messages[1].content).not.toContain('The Best Bot');
    expect(request.messages[1].content).toContain('Alonso');
    expect(request.messages[1].content).toContain('Chinese Grand Prix');
  });

  it('offers a league picker when the user follows multiple leagues', async () => {
    listUserLeagues.mockResolvedValue([
      { leagueCode: 'A', leagueName: 'Alpha' },
      { leagueCode: 'B' },
    ]);
    const bot = { sendMessage: jest.fn().mockResolvedValue() };
    await handleRaceSummaryCommand(bot, { chat: { id: 42 }, message_id: 7 });
    expect(
      bot.sendMessage.mock.calls[0][2].reply_markup.inline_keyboard,
    ).toEqual([
      [{ text: 'Alpha', callback_data: 'RACE_SUMMARY:A' }],
      [{ text: 'B', callback_data: 'RACE_SUMMARY:B' }],
    ]);
  });
});
