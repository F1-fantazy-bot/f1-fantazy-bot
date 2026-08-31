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
  });

  expect(result.lang).toBe('he');
  expect(result.title).toContain('עמדת הפיקוד');
  expect(result.recommendations.map((task) => task.id)).toEqual([
    'optimize_team',
    'live_score',
    'race_schedule',
  ]);
  expect(result.notices).toEqual([]);
});

test('filters topics and hides admin guidance from non-admins', () => {
  expect(
    buildAgentGuide({
      topic: 'teams',
      isAdmin: false,
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
