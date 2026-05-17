const { KILZI_CHAT_ID } = require('../constants');

const mockCalculateBestTeams = jest.fn();
jest.mock('../bestTeamsCalculator', () => ({
  calculateBestTeams: (...args) => mockCalculateBestTeams(...args),
}));

const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  sharedKey,
  remainingRaceCountCache,
  userCache,
  pricesCache,
} = require('../cache');

const {
  computeBestTeamScenarios,
  PPM_SCENARIOS,
} = require('./bestTeamScenariosCore');

const TEAM_ID = 'T1';

function seedValidCache() {
  driversCache[KILZI_CHAT_ID] = { VER: { price: 30 }, HAM: { price: 28 } };
  constructorsCache[KILZI_CHAT_ID] = { RED: { price: 35 }, MER: { price: 32 } };
  currentTeamCache[KILZI_CHAT_ID] = {
    [TEAM_ID]: {
      drivers: ['VER', 'HAM'],
      constructors: ['RED', 'MER'],
      boost: 'VER',
      freeTransfers: 2,
      costCapRemaining: 5,
      teamName: 'kilzid3',
    },
  };
}

function clearCaches() {
  delete driversCache[KILZI_CHAT_ID];
  delete driversCache[sharedKey];
  delete constructorsCache[KILZI_CHAT_ID];
  delete constructorsCache[sharedKey];
  delete currentTeamCache[KILZI_CHAT_ID];
  delete selectedChipCache[KILZI_CHAT_ID];
  delete remainingRaceCountCache[sharedKey];
  delete userCache[String(KILZI_CHAT_ID)];
  pricesCache.drivers = {};
  pricesCache.constructors = {};
  pricesCache.metadata = null;
}

describe('computeBestTeamScenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCaches();
  });

  test('returns missing_cache when no team is cached', () => {
    seedValidCache();
    delete currentTeamCache[KILZI_CHAT_ID][TEAM_ID];
    currentTeamCache[KILZI_CHAT_ID].other = { teamName: 'other' };
    mockCalculateBestTeams.mockReturnValue([]);

    const result = computeBestTeamScenarios({
      chatId: KILZI_CHAT_ID,
      teamId: TEAM_ID,
    });

    expect(result.status).toBe('unknown_team');
  });

  test('returns no_teams when the user has no teams', () => {
    const result = computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('no_teams');
  });

  test('builds a 4×4 matrix and labels match presets', () => {
    seedValidCache();
    // Each call returns one top team with rising projected_points so
    // recommendation thresholds can be exercised deterministically.
    let pts = 50;
    mockCalculateBestTeams.mockImplementation(() => [
      {
        projected_points: pts++,
        expected_price_change: 0.25,
      },
    ]);

    const result = computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });

    expect(result.status).toBe('ok');
    expect(result.teamId).toBe(TEAM_ID);
    expect(result.teamName).toBe('kilzid3');
    expect(result.scenarios).toHaveLength(4);

    const ppmValues = result.scenarios.map((s) => s.ppm);
    expect(ppmValues).toEqual([0, 1.3, 1.65, 2]);

    const ppmLabels = result.scenarios.map((s) => s.ppmLabel);
    expect(ppmLabels).toEqual(PPM_SCENARIOS.map((p) => p.label));

    // Each ppm row contains 4 chip results in the expected order.
    for (const row of result.scenarios) {
      expect(row.results.map((r) => r.chipLabel)).toEqual([
        'Without Chip',
        'Limitless',
        'Extra Boost',
        'Wildcard',
      ]);
      // The baseline row never carries a recommendation.
      expect(row.results[0].recommendation).toBeNull();
    }
  });

  test('flags green recommendation when chip beats baseline by enough', () => {
    seedValidCache();
    // Stub: no-chip baseline = 50; Limitless = 175 (>120 diff = green);
    // Extra Boost = 110 (>60 ≥70? no — 60 yellow); Wildcard = 85 (35>30 green).
    const sequence = [
      // ppm=0 row: no-chip / Limitless / Extra Boost / Wildcard
      { projected_points: 50, expected_price_change: 0 },
      { projected_points: 175, expected_price_change: 0 },
      { projected_points: 110, expected_price_change: 0 },
      { projected_points: 85, expected_price_change: 0 },
    ];
    let nextRow = 1;
    mockCalculateBestTeams.mockImplementation(() => {
      const idx = (nextRow++ - 1) % sequence.length;

      return [sequence[idx]];
    });

    const result = computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    const firstPpmRow = result.scenarios[0];

    expect(firstPpmRow.results[0].recommendation).toBeNull(); // baseline
    expect(firstPpmRow.results[1].recommendation).toBe('green'); // Limitless 125 diff
    expect(firstPpmRow.results[2].recommendation).toBe('yellow'); // Extra Boost 60 diff
    expect(firstPpmRow.results[3].recommendation).toBe('green'); // Wildcard 35 diff
  });

  test('handles missing topTeam (calculator returned empty)', () => {
    seedValidCache();
    mockCalculateBestTeams.mockReturnValue([]);

    const result = computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('ok');
    for (const row of result.scenarios) {
      for (const cell of row.results) {
        expect(cell.projectedPoints).toBeNull();
        expect(cell.expectedPriceChange).toBeNull();
        expect(cell.recommendation).toBeNull();
      }
    }
  });

  test('resolves a team by teamName (case-insensitive)', () => {
    seedValidCache();
    mockCalculateBestTeams.mockReturnValue([
      { projected_points: 50, expected_price_change: 0 },
    ]);

    const result = computeBestTeamScenarios({
      chatId: KILZI_CHAT_ID,
      teamName: 'KILZID3',
    });
    expect(result.status).toBe('ok');
    expect(result.teamId).toBe(TEAM_ID);
  });
});
