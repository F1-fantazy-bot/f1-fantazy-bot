const {
  buildAgentGuide,
  getTelegramHelpCategories,
  getTelegramUsageFlow,
} = require('./agentGuideCore');

test('keeps admin Telegram help categories hidden from regular users', () => {
  expect(
    getTelegramHelpCategories({ isAdmin: false }).some(
      (category) => category.adminOnly,
    ),
  ).toBe(false);
  expect(
    getTelegramHelpCategories({ isAdmin: true }).some(
      (category) => category.adminOnly,
    ),
  ).toBe(true);
});

test('preserves the established Telegram flow model', () => {
  const flow = getTelegramUsageFlow('en');

  expect(flow.title).toBe('🏁 F1 Fantasy Bot - Usage Flow');
  expect(flow.steps).toHaveLength(8);
  expect(flow.steps[0][1]).toBe('Follow Your League');
  expect(flow.tips).toContain(
    '• Just type any question naturally — the bot understands free text too!',
  );
});

test('personalizes onboarding for a user without leagues', () => {
  const result = buildAgentGuide({
    lang: 'en',
    leagueCount: 0,
    teamCount: 0,
    hasProjectionData: true,
    hasSimulationData: true,
  });

  expect(result.status).toBe('ok');
  expect(result.recommendations.map((task) => task.id)).toEqual([
    'manage_leagues',
    'race_schedule',
  ]);
});

test('personalizes established users around optimization and live score', () => {
  const result = buildAgentGuide({
    lang: 'he',
    leagueCount: 2,
    teamCount: 3,
    followedTeamCount: 3,
    hasProjectionData: true,
    hasSimulationData: true,
    selectedTeamName: 'dorsegal3',
    teamNames: ['dorsegal1', 'dorsegal2', 'dorsegal3'],
    leagueNames: ['Friends League'],
  });

  expect(result.lang).toBe('he');
  expect(result.title).toContain('עמדת הפיקוד');
  expect(result.recommendations.map((task) => task.id)).toEqual([
    'optimize_team',
    'live_score',
    'race_schedule',
  ]);
  expect(result.notices).toEqual([]);
  expect(
    result.sections
      .flatMap((section) => section.tasks)
      .find((task) => task.id === 'optimize_team')?.example,
  ).toContain('dorsegal3');
  expect(
    result.sections
      .flatMap((section) => section.tasks)
      .find((task) => task.id === 'live_score')?.example,
  ).toContain('Friends League');
  expect(JSON.stringify(result)).not.toContain('Kilzid');
  expect(JSON.stringify(result)).not.toContain('kilzi test');
});

test('filters topics and hides admin guidance from non-admins', () => {
  expect(
    buildAgentGuide({
      topic: 'teams',
      isAdmin: false,
      teamCount: 1,
      leagueCount: 1,
      hasProjectionData: true,
    }).sections.map((section) => section.topic),
  ).toEqual(['teams']);
  expect(
    buildAgentGuide({
      topic: 'admin',
      isAdmin: false,
    }),
  ).toMatchObject({ status: 'forbidden', topic: 'admin' });
  expect(
    buildAgentGuide({
      topic: 'admin',
      isAdmin: true,
    }).sections.map((section) => section.topic),
  ).toEqual(['admin']);
});

test('hides cards whose user prerequisites are missing', () => {
  const withoutData = buildAgentGuide({
    leagueCount: 0,
    teamCount: 0,
    hasProjectionData: false,
  });
  const taskIds = withoutData.sections.flatMap((section) =>
    section.tasks.map((task) => task.id),
  );

  expect(taskIds).not.toContain('optimize_team');
  expect(taskIds).not.toContain('inspect_team');
  expect(taskIds).not.toContain('compare_scenarios');
  expect(taskIds).not.toContain('manage_teams');
  expect(taskIds).not.toContain('league_standings');
  expect(taskIds).not.toContain('live_score');
  expect(taskIds).toContain('manage_leagues');
  expect(taskIds).toContain('race_schedule');
});

test('falls back to setup actions when a focused topic has no available tasks', () => {
  const result = buildAgentGuide({
    topic: 'teams',
    leagueCount: 0,
    teamCount: 0,
    hasProjectionData: false,
  });

  expect(result.sections).not.toEqual([]);
  expect(result.recommendations.map((task) => task.id)).toEqual([
    'manage_leagues',
    'race_schedule',
  ]);
});

test('interpolates dollar sequences in user names literally', () => {
  const result = buildAgentGuide({
    teamCount: 1,
    leagueCount: 1,
    hasProjectionData: true,
    selectedTeamName: 'A$&B',
    leagueNames: ['L$`X'],
  });
  const tasks = result.sections.flatMap((section) => section.tasks);

  expect(tasks.find((task) => task.id === 'optimize_team')?.example).toContain(
    'A$&B',
  );
  expect(tasks.find((task) => task.id === 'league_standings')?.example).toContain(
    'L$`X',
  );
  expect(JSON.stringify(result)).not.toContain('{TEAM}');
  expect(JSON.stringify(result)).not.toContain('{LEAGUE}');
});
