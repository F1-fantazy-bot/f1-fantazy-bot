jest.mock('@copilotkit/runtime/v2', () => ({ defineTool: (spec) => spec }));
jest.mock('../cacheBootstrap', () => ({ ensureCacheReady: jest.fn() }));
jest.mock('../identity', () => ({ getAgentChatId: () => 42 }));
jest.mock('../../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));
jest.mock('../../cores/userTeamsCore', () => ({ listUserTeams: jest.fn() }));
jest.mock('../../cores/liveScoreCore', () => ({ listLeagueTeams: jest.fn() }));
jest.mock('../../cache', () => ({
  getDriversForChat: jest.fn(),
  getConstructorsForChat: jest.fn(),
}));
jest.mock('../../services/setLanguageService', () => ({
  getFreshLanguagePreference: jest.fn(),
}));
jest.mock('../../services/setBestTeamRankingService', () => ({
  availablePresets: jest.fn(),
}));
jest.mock('../../services/activateChipService', () => ({
  availableChips: jest.fn(),
}));
jest.mock('../notifierBot', () => ({
  getNotifierBot: () => ({ sendMessage: jest.fn() }),
}));
jest.mock('../../utils/utils', () => ({ sendErrorMessage: jest.fn() }));

const { listUserLeagues } = require('../../leagueRegistryService');
const { listUserTeams } = require('../../cores/userTeamsCore');
const { listLeagueTeams } = require('../../cores/liveScoreCore');
const { getDriversForChat, getConstructorsForChat } = require('../../cache');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  availablePresets,
} = require('../../services/setBestTeamRankingService');
const { availableChips } = require('../../services/activateChipService');
const {
  getActionChoicesTool,
  getActionChoices,
  wrapSelectableExecute,
} = require('./getActionChoicesTool');

beforeEach(() => {
  jest.clearAllMocks();
  getFreshLanguagePreference.mockResolvedValue({ lang: 'he' });
  listUserLeagues.mockResolvedValue([
    { leagueCode: 'CANONICAL', leagueName: 'My league', secret: 'private' },
  ]);
  listUserTeams.mockReturnValue([
    { teamId: 'OWNED_2', teamName: 'My team', drivers: ['VER'] },
  ]);
  listLeagueTeams.mockResolvedValue({
    status: 'ok',
    leagueCode: 'CANONICAL',
    teams: [{ teamId: 'LOCKED_1', teamName: 'Locked team' }],
  });
});

test.each([
  'get_live_score_for_team',
  'get_live_score_leaderboard',
  'get_leaderboard',
])(
  '%s without a league returns account choices before reading league storage',
  async (action) => {
    const execute = jest.fn();
    const result = await wrapSelectableExecute(
      action,
      execute,
    )({ teamName: 'Requested team' });
    expect(execute).not.toHaveBeenCalled();
    expect(listUserLeagues).toHaveBeenCalledWith(42);
    expect(result).toMatchObject({
      status: 'selection_required',
      lang: 'he',
      choice: 'league',
      options: [
        {
          action,
          label: 'My league',
          args: { leagueCode: 'CANONICAL', teamName: 'Requested team' },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('private');
  },
);

test('empty accounts show an empty choice state without fabricating leagues', async () => {
  listUserLeagues.mockResolvedValue([]);
  expect(
    await getActionChoices({ action: 'get_leaderboard', choice: 'league' }),
  ).toMatchObject({ options: [] });
});

test.each(['get_best_teams', 'get_best_team_scenarios', 'get_current_team'])(
  '%s disambiguation preserves the pending read and filters',
  async (action) => {
    const execute = jest.fn().mockResolvedValue({ status: 'ambiguous_team' });
    const result = await wrapSelectableExecute(
      action,
      execute,
    )({
      teamName: 'bad',
      rankBy: 'budget_adjusted',
      mustIncludeDrivers: ['VER'],
    });
    expect(result.options[0]).toMatchObject({
      action,
      args: {
        teamId: 'OWNED_2',
        rankBy: 'budget_adjusted',
        mustIncludeDrivers: ['VER'],
      },
    });
    expect(result.options[0].args.teamName).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('select_team');
  },
);

test('a successful selected-team read runs directly, without listing other teams', async () => {
  const execute = jest
    .fn()
    .mockResolvedValue({ status: 'ok', teamId: 'SELECTED' });
  expect(await wrapSelectableExecute('get_current_team', execute)({})).toEqual({
    status: 'ok',
    teamId: 'SELECTED',
  });
  expect(listUserTeams).not.toHaveBeenCalled();
});

test('live team recovery uses the authorized locked roster, not owned cached teams', async () => {
  const result = await wrapSelectableExecute(
    'get_live_score_for_team',
    async () => ({ status: 'team_not_found' }),
  )({ leagueCode: 'CANONICAL', teamName: 'gone' });
  expect(listLeagueTeams).toHaveBeenCalledWith({
    chatId: 42,
    leagueCode: 'CANONICAL',
    teamName: 'gone',
  });
  expect(listUserTeams).not.toHaveBeenCalled();
  expect(result.options[1].args).toMatchObject({
    leagueCode: 'CANONICAL',
    teamId: 'LOCKED_1',
  });
  expect(result.options[0]).toMatchObject({
    label: 'כל הקבוצות בליגה',
    action: 'get_live_score_leaderboard',
    args: { leagueCode: 'CANONICAL' },
  });
  expect(result.options[0].args.teamName).toBeUndefined();
  expect(result.options[0].args.teamId).toBeUndefined();
});

test.each(['en', 'he'])('live scores always offer teams and the league-wide option in %s', async (lang) => {
  getFreshLanguagePreference.mockResolvedValue({ lang });
  const execute = jest.fn().mockResolvedValue({ status: 'ok', teamId: 'ACTIVE_TEAM' });
  const result = await wrapSelectableExecute('get_live_score_for_team', execute)({ leagueCode: 'CANONICAL' });
  expect(execute).not.toHaveBeenCalled();
  expect(result.choice).toBe('team');
  expect(result.options.map((option) => option.action)).toEqual(['get_live_score_leaderboard', 'get_live_score_for_team']);
  expect(result.options[0].label).toBe(lang === 'he' ? 'כל הקבוצות בליגה' : 'All teams in this league');
});

test('ambiguous league names never silently choose the first match', async () => {
  listUserLeagues.mockResolvedValue([
    { leagueName: 'Work A', leagueCode: 'A' },
    { leagueName: 'Work B', leagueCode: 'B' },
  ]);
  const execute = jest.fn();
  const result = await wrapSelectableExecute(
    'get_live_score_for_team',
    execute,
  )({ leagueName: 'Work' });
  expect(result.options).toHaveLength(2);
  expect(execute).not.toHaveBeenCalled();
});

test('unauthorized league choices do not fall back to private rosters or leak core errors', async () => {
  listLeagueTeams.mockResolvedValue({
    status: 'not_followed',
    error: 'https://storage?sig=secret',
  });
  const result = await getActionChoices({
    action: 'get_live_score_for_team',
    choice: 'team',
    context: { leagueCode: 'FOREIGN' },
  });
  expect(result).toEqual({ status: 'not_followed', lang: 'he' });
  expect(listUserTeams).not.toHaveBeenCalled();
});

test('ranking and chip choices use the shared supported values and preserve team context', async () => {
  availablePresets.mockReturnValue([
    { id: 'points_lean', label: 'Points Lean', value: 1.3 },
  ]);
  availableChips.mockReturnValue([{ chip: 'WILDCARD', label: 'Wildcard' }]);
  for (const [action, choice, expected] of [
    ['set_best_team_ranking', 'preset', { presetId: 'points_lean' }],
    ['activate_chip', 'chip', { chip: 'WILDCARD' }],
  ]) {
    const result = await getActionChoices({
      action,
      choice,
      context: { teamId: 'OWNED_2' },
    });
    expect(result.options[0].args).toMatchObject({
      teamId: 'OWNED_2',
      ...expected,
    });
  }
});

test('language choices only propose supported preferences', async () => {
  const result = await getActionChoices({
    action: 'set_language',
    choice: 'language',
  });
  expect(result.options.map((option) => option.args.lang)).toEqual([
    'en',
    'he',
  ]);
  expect(
    result.options.every((option) => option.action === 'set_language'),
  ).toBe(true);
});

test('filter choices use account projections and retain prior constraints', async () => {
  getDriversForChat.mockReturnValue({ VER: {}, NOR: {} });
  getConstructorsForChat.mockReturnValue({ MCL: {} });
  const driver = await getActionChoices({
    action: 'get_best_teams',
    choice: 'include_driver',
    context: {
      teamId: 'T2',
      mustIncludeDrivers: ['VER'],
      mustExcludeConstructors: ['FER'],
    },
  });
  expect(getDriversForChat).toHaveBeenCalledWith(42);
  expect(driver.options[0]).toMatchObject({
    label: 'NOR',
    args: {
      teamId: 'T2',
      mustIncludeDrivers: ['VER', 'NOR'],
      mustExcludeConstructors: ['FER'],
    },
  });
  const constructor = await getActionChoices({
    action: 'get_best_teams',
    choice: 'exclude_constructor',
  });
  expect(constructor.options[0].args.mustExcludeConstructors).toEqual(['MCL']);
});

test('sort-order choices preserve team and filters', async () => {
  const result = await getActionChoices({
    action: 'get_best_teams',
    choice: 'ranking',
    context: { teamId: 'T2', mustIncludeDrivers: ['NOR'] },
  });
  expect(result.options.map((option) => option.args.rankBy)).toEqual([
    'points',
    'budget_adjusted',
  ]);
  expect(
    result.options.every(
      (option) =>
        option.args.teamId === 'T2' &&
        option.args.mustIncludeDrivers[0] === 'NOR',
    ),
  ).toBe(true);
});

test('direct live-team choice discovery also resolves ambiguous leagues before reading a roster', async () => {
  listUserLeagues.mockResolvedValue([
    { leagueName: 'Work A', leagueCode: 'A' },
    { leagueName: 'Work B', leagueCode: 'B' },
  ]);
  const result = await getActionChoices({
    action: 'get_live_score_for_team',
    choice: 'team',
    context: { leagueName: 'Work' },
  });
  expect(result.choice).toBe('league');
  expect(listLeagueTeams).not.toHaveBeenCalled();
});

test('choice discovery rejects arbitrary actions, identity, and confirmation parameters', () => {
  for (const input of [
    { action: 'confirm_write', choice: 'team' },
    { action: 'get_current_team', choice: 'team', context: { chatId: 99 } },
    {
      action: 'set_language',
      choice: 'language',
      context: { writeNonce: 'nonce' },
    },
  ]) {
    expect(getActionChoicesTool.parameters.safeParse(input).success).toBe(
      false,
    );
  }
});

test('unexpected discovery errors are wrapped without raw provider details', async () => {
  listUserLeagues.mockRejectedValue(new Error('https://storage?sig=secret'));
  const result = await getActionChoicesTool.execute({
    action: 'get_leaderboard',
    choice: 'league',
  });
  expect(result.status).toBe('tool_error');
  expect(JSON.stringify(result)).not.toContain('sig=');
});
