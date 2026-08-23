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
const {
  buildRaceSummaryData,
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
  });

  it('builds latest-race and season movement facts and excludes the graph bot', () => {
    const data = buildRaceSummaryData(fixture, lockedFixture);
    expect(data.latestMatchday).toBe('matchday_2');
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
    expect(data.rosterDifferentials[0]).toMatchObject({
      name: 'Alonso',
      owners: ['Rocket'],
      nonOwners: ['Turtle'],
      averageScoreDifference: 150,
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
    expect(getLeagueData).toHaveBeenCalledWith('ABC');
    expect(getLockedTeamsData).toHaveBeenCalledWith('ABC');
    expect(bot.sendMessage).toHaveBeenCalledWith(42, '🏁 Rocket wins!');
    const request = openAiClient.chat.completions.create.mock.calls[0][0];
    expect(request.messages[0].content).toContain('English');
    expect(request.messages[0].content).toContain('main roster differences');
    expect(request.messages[0].content).toContain(
      'Do not mention or compare the immediately previous race result',
    );
    expect(request.messages[1].content).not.toContain('The Best Bot');
    expect(request.messages[1].content).toContain('Alonso');
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
