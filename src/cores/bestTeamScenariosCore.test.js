const activeExpiry = {
  selectedAt: new Date(Date.now() - 86400000).toISOString(),
  expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
};

const { KILZI_CHAT_ID, LIMITLESS_CHIP, EXTRA_BOOST_CHIP, WILDCARD_CHIP } = require('../constants');

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

const TEAM_ID = 'Owner_1_abc123';
jest.mock('./availableChipsCore', () => ({ getAvailableChips: jest.fn() }));
const { getAvailableChips } = require('./availableChipsCore');
function seedAvailability() {
  getAvailableChips.mockResolvedValue({ status: 'ok', partial: false, teams: [{
    teamId: TEAM_ID, chipUsageStatus: 'known',
    availableChips: ['Limitless', 'Extra DRS Boost', 'Wildcard'], updatedAt: new Date().toISOString(),
  }] });
}

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
    seedAvailability();
  });

  test('returns missing_cache when no team is cached', async () => {
    seedValidCache();
    delete currentTeamCache[KILZI_CHAT_ID][TEAM_ID];
    currentTeamCache[KILZI_CHAT_ID].other = { teamName: 'other' };
    mockCalculateBestTeams.mockReturnValue([]);

    const result = await computeBestTeamScenarios({
      chatId: KILZI_CHAT_ID,
      teamId: TEAM_ID,
    });

    expect(result.status).toBe('unknown_team');
  });

  test('returns no_teams when the user has no teams', async () => {
    const result = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('no_teams');
  });

  test('builds a 4×4 matrix and labels match presets', async () => {
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

    const result = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });

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

  test('flags green recommendation when chip beats baseline by enough', async () => {
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

    const result = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    const firstPpmRow = result.scenarios[0];

    expect(firstPpmRow.results[0].recommendation).toBeNull(); // baseline
    expect(firstPpmRow.results[1].recommendation).toBe('green'); // Limitless 125 diff
    expect(firstPpmRow.results[2].recommendation).toBe('yellow'); // Extra Boost 60 diff
    expect(firstPpmRow.results[3].recommendation).toBe('green'); // Wildcard 35 diff
  });

  test('handles missing topTeam (calculator returned empty)', async () => {
    seedValidCache();
    mockCalculateBestTeams.mockReturnValue([]);

    const result = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('ok');
    for (const row of result.scenarios) {
      for (const cell of row.results) {
        expect(cell.projectedPoints).toBeNull();
        expect(cell.expectedPriceChange).toBeNull();
        expect(cell.recommendation).toBeNull();
      }
    }
  });

  test('resolves a team by teamName (case-insensitive)', async () => {
    seedValidCache();
    mockCalculateBestTeams.mockReturnValue([
      { projected_points: 50, expected_price_change: 0 },
    ]);

    const result = await computeBestTeamScenarios({
      chatId: KILZI_CHAT_ID,
      teamName: 'KILZID3',
    });
    expect(result.status).toBe('ok');
    expect(result.teamId).toBe(TEAM_ID);
  });
});

const savedChips = [undefined, 'WITHOUT_CHIP', LIMITLESS_CHIP, EXTRA_BOOST_CHIP, WILDCARD_CHIP];

describe('scenario independence', () => {
  beforeEach(() => {
    clearCaches();
    seedAvailability();
    mockCalculateBestTeams.mockReset();
    seedValidCache();
  });

  test.each(savedChips)('uses explicit scenario chips with saved selection %s', async (savedChip) => {
    mockCalculateBestTeams.mockImplementation((_, chip, ppm) => [{
      projected_points: 50 + ppm + ({ [LIMITLESS_CHIP]: 125, [EXTRA_BOOST_CHIP]: 60, [WILDCARD_CHIP]: 35 }[chip] || 0),
      expected_price_change: chip === LIMITLESS_CHIP ? 0 : 0.25,
    }]);
    const baseline = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    mockCalculateBestTeams.mockClear();
    selectedChipCache[KILZI_CHAT_ID] = { [TEAM_ID]: savedChip };
    userCache[String(KILZI_CHAT_ID)] = { selectedChipExpiryByTeam: { [TEAM_ID]: activeExpiry } };
    const savedState = JSON.stringify({ chips: selectedChipCache, teams: currentTeamCache });
    const result = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    expect(result.chip).toBe(savedChip === 'WITHOUT_CHIP' ? null : savedChip || null);
    expect(result.scenarios).toEqual(baseline.scenarios);
    expect(mockCalculateBestTeams).toHaveBeenCalledTimes(16);
    for (const { ppm, results } of result.scenarios) {
      expect(mockCalculateBestTeams.mock.calls.filter(([, , value]) => value === ppm)
        .map(([, chip]) => chip)).toEqual([null, LIMITLESS_CHIP, EXTRA_BOOST_CHIP, WILDCARD_CHIP]);
      expect(results[0].chipKey).toBeNull();
      expect(results.map((cell) => cell.recommendation)).toEqual([null, 'green', 'yellow', 'green']);
    }
    expect(JSON.stringify({ chips: selectedChipCache, teams: currentTeamCache })).toBe(savedState);
  });

  test('returns missing_cache when driver data is absent', async () => {
    delete driversCache[KILZI_CHAT_ID];
    expect((await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID })).status).toBe('missing_cache');
    expect(mockCalculateBestTeams).not.toHaveBeenCalled();
  });

  test('real calculator keeps chip-free scores and recommendations independent of preferences', async () => {
    const realCalculate = jest.requireActual('../bestTeamsCalculator').calculateBestTeams;
    mockCalculateBestTeams.mockImplementation(realCalculate);
    driversCache[KILZI_CHAT_ID] = Object.fromEntries(
      ['VER', 'HAM', 'LEC', 'NOR', 'SAI', 'PER'].map((code, index) => [code, {
        DR: code, price: 10, expectedPoints: 10 + index * 20, expectedPriceChange: index * 0.1,
      }]),
    );
    constructorsCache[KILZI_CHAT_ID] = {
      RED: { CN: 'RED', price: 10, expectedPoints: 20, expectedPriceChange: 0.2 },
      MER: { CN: 'MER', price: 10, expectedPoints: 30, expectedPriceChange: 0.3 },
    };
    currentTeamCache[KILZI_CHAT_ID][TEAM_ID] = {
      drivers: ['VER', 'HAM', 'LEC', 'NOR', 'SAI'], constructors: ['RED', 'MER'],
      boost: 'SAI', freeTransfers: 0, costCapRemaining: 0,
    };
    const baseline = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    for (const { results } of baseline.scenarios) {
      expect(results[0].projectedPoints).toBeGreaterThan(0);
      for (const cell of results.slice(1)) {
        expect(cell.projectedPoints).toBeGreaterThan(results[0].projectedPoints);
      }
    }
    for (const savedChip of savedChips) {
      selectedChipCache[KILZI_CHAT_ID] = { [TEAM_ID]: savedChip };
      userCache[String(KILZI_CHAT_ID)] = { selectedChipExpiryByTeam: { [TEAM_ID]: activeExpiry } };
      const savedState = JSON.stringify({ chips: selectedChipCache, teams: currentTeamCache });
      const result = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
      expect(result.scenarios).toEqual(baseline.scenarios);
      expect(result.chip).toBe(savedChip === 'WITHOUT_CHIP' ? null : savedChip || null);
      expect(JSON.stringify({ chips: selectedChipCache, teams: currentTeamCache })).toBe(savedState);
    }
  });
});

describe('available scenario chips', () => {
  beforeEach(() => {
    clearCaches();
    seedValidCache();
    jest.clearAllMocks();
    mockCalculateBestTeams.mockImplementation((_, chip, ppm) => [{
      projected_points: 50 + ppm + ({ [LIMITLESS_CHIP]: 125, [EXTRA_BOOST_CHIP]: 60, [WILDCARD_CHIP]: 35 }[chip] || 0),
      expected_price_change: 0.25,
    }]);
  });

  test.each(Array.from({ length: 8 }, (_, used) => [used]))('filters used-chip combination %i before calculating', async (used) => {
    const catalog = ['Limitless', 'Extra DRS Boost', 'Wildcard'];
    const chipKeys = [LIMITLESS_CHIP, EXTRA_BOOST_CHIP, WILDCARD_CHIP];
    const availableChips = catalog.filter((_, index) => !(used & (1 << index)));
    const updatedAt = new Date().toISOString();
    getAvailableChips.mockResolvedValue({ status: 'ok', partial: false, teams: [{
      teamId: TEAM_ID, chipUsageStatus: 'known', availableChips, updatedAt,
    }] });
    // A saved used chip cannot restore its scenario.
    selectedChipCache[KILZI_CHAT_ID] = { [TEAM_ID]: LIMITLESS_CHIP };
    userCache[String(KILZI_CHAT_ID)] = { selectedChipExpiryByTeam: { [TEAM_ID]: activeExpiry } };
    const before = JSON.stringify({ teams: currentTeamCache, users: userCache, chips: selectedChipCache });
    const result = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    const expected = [null, ...chipKeys.filter((_, index) => !(used & (1 << index)))];
    expect(result.chipAvailability).toEqual({ status: 'known', updatedAt });
    expect(result.scenarios).toHaveLength(4);
    for (const { ppm, results } of result.scenarios) {
      expect(results.map((cell) => cell.chipKey)).toEqual(expected);
      expect(mockCalculateBestTeams.mock.calls.filter(([, , value]) => value === ppm).map(([, chip]) => chip)).toEqual(expected);
      expect(results[0]).toMatchObject({ projectedPoints: 50 + ppm, expectedPriceChange: 0.25, recommendation: null });
      for (const cell of results.slice(1)) {
        expect(cell.recommendation).toBe(cell.chipKey === EXTRA_BOOST_CHIP ? 'yellow' : 'green');
      }
    }
    expect(mockCalculateBestTeams).toHaveBeenCalledTimes(4 * expected.length);
    expect(getAvailableChips).toHaveBeenCalledTimes(1);
    expect(JSON.stringify({ teams: currentTeamCache, users: userCache, chips: selectedChipCache })).toBe(before);
  });

  test.each([null, { status: 'unavailable' }, { status: 'selection_required' },
    { status: 'ok', partial: true, teams: [{ teamId: TEAM_ID, chipUsageStatus: 'known', availableChips: ['Limitless'] }] },
    { status: 'ok', teams: [{ teamId: TEAM_ID, chipUsageStatus: 'unknown', availableChips: null }] },
  ])('unknown lookup %j retains four no-chip baselines', async (lookup) => {
    getAvailableChips.mockResolvedValue(lookup);
    const result = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    expect(result.chipAvailability.status).toBe('unknown');
    expect(result.scenarios.map((row) => row.results.map((cell) => cell.chipKey))).toEqual([[null], [null], [null], [null]]);
    expect(mockCalculateBestTeams).toHaveBeenCalledTimes(4);
  });

  test('lookup failure still calculates no-chip results', async () => {
    getAvailableChips.mockRejectedValue(new Error('unavailable'));
    const result = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    expect(result.status).toBe('ok');
    expect(result.chipAvailability.status).toBe('unknown');
    expect(mockCalculateBestTeams.mock.calls.map(([, chip]) => chip)).toEqual([null, null, null, null]);
  });

  test('active default and explicit targets resolve independent canonical availability each time', async () => {
    const second = 'Owner_2_abc123';
    const third = 'Owner_3_abc123';
    currentTeamCache[KILZI_CHAT_ID][TEAM_ID].teamName = 'Kilzid';
    currentTeamCache[KILZI_CHAT_ID][second] = { ...currentTeamCache[KILZI_CHAT_ID][TEAM_ID], teamName: 'Kilzid2' };
    currentTeamCache[KILZI_CHAT_ID][third] = { ...currentTeamCache[KILZI_CHAT_ID][TEAM_ID], teamName: 'Kilzid 3' };
    userCache[String(KILZI_CHAT_ID)] = { selectedTeam: second };
    const available = { [TEAM_ID]: ['Wildcard'], [second]: [], [third]: ['Limitless'] };
    getAvailableChips.mockImplementation(async ({ teamId }) => ({ status: 'ok', teams: [{
      teamId, chipUsageStatus: 'known', availableChips: available[teamId], updatedAt: null,
    }] }));
    const active = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID });
    const explicit = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID, teamId: TEAM_ID });
    const named = await computeBestTeamScenarios({ chatId: KILZI_CHAT_ID, teamName: 'Kilzid 3' });
    expect(active.teamId).toBe(second);
    expect([explicit, active, named].map((result) => result.scenarios[0].results.map((cell) => cell.chipKey)))
      .toEqual([[null, WILDCARD_CHIP], [null], [null, LIMITLESS_CHIP]]);
    expect(getAvailableChips.mock.calls.map(([args]) => args)).toEqual([second, TEAM_ID, third].map((teamId) => ({ chatId: KILZI_CHAT_ID, scope: 'team', teamId })));
    expect(userCache[String(KILZI_CHAT_ID)].selectedTeam).toBe(second);
  });
});
