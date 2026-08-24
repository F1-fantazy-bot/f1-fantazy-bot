const {
  INACTIVE_DRIVER_POINTS,
  prepareBestTeamsData,
} = require('./bestTeamsData');

function buildFixture(weekendFormat = 'regular') {
  return {
    drivers: {
      LAW: {
        DR: 'LAW',
        price: 14.5,
        expectedPoints: 8.9,
        expectedPriceChange: 0.09,
      },
      TSU: {
        DR: 'TSU',
        price: 10.3,
        expectedPoints: -0.7,
        expectedPriceChange: -0.35,
      },
      BOR: {
        DR: 'BOR',
        price: 7.8,
        expectedPoints: 2,
        expectedPriceChange: 0.1,
      },
    },
    constructors: {
      FER: {
        CN: 'FER',
        price: 26.6,
        expectedPoints: 30,
        expectedPriceChange: 0.2,
      },
    },
    currentTeam: {
      drivers: ['HAD', 'LAW', 'BOR'],
      driverIds: ['11032', '114', '11051'],
      constructors: ['FER'],
      boost: 'BOR',
      boostDriverId: '11051',
      freeTransfers: 2,
      costCapRemaining: 0.2,
    },
    driverEntries: [
      {
        id: '116',
        name: 'L. Lawson',
        code: 'LAW',
        price: 14.5,
        isActive: true,
      },
      {
        id: '11032',
        name: 'I. Hadjar',
        code: 'HAD',
        price: 14.5,
        isActive: false,
      },
      {
        id: '130',
        name: 'Y. Tsunoda',
        code: 'TSU',
        price: 10.3,
        isActive: true,
      },
      {
        id: '114',
        name: 'L. Lawson',
        code: 'LAW',
        price: 10.3,
        isActive: false,
      },
      {
        id: '11051',
        name: 'G. Bortoleto',
        code: 'BOR',
        price: 7.8,
        isActive: true,
      },
      {
        id: '999',
        name: 'Inactive Unowned',
        code: 'OLD',
        price: 5,
        isActive: false,
      },
    ],
    nextRaceInfo: { weekendFormat },
  };
}

describe('prepareBestTeamsData', () => {
  it('preserves the legacy code-keyed path when player IDs are unavailable', () => {
    const data = {
      drivers: { VER: { price: 30, expectedPoints: 20 } },
      constructors: { FER: { price: 20, expectedPoints: 30 } },
      currentTeam: {
        drivers: ['VER'],
        constructors: ['FER'],
        boost: 'VER',
      },
    };

    expect(prepareBestTeamsData(data)).toEqual({
      status: 'ok',
      calculationData: {
        Drivers: data.drivers,
        Constructors: data.constructors,
        CurrentTeam: data.currentTeam,
      },
      usesPlayerIds: false,
    });
  });

  it('returns a controlled mismatch for a missing legacy projection', () => {
    const result = prepareBestTeamsData({
      drivers: {},
      constructors: { FER: {} },
      currentTeam: {
        drivers: ['HAD'],
        constructors: ['FER'],
      },
    });

    expect(result).toMatchObject({
      status: 'projection_mismatch',
      missingDrivers: ['HAD'],
    });
  });

  it('uses active drivers plus owned inactive drivers on a regular weekend', () => {
    const result = prepareBestTeamsData(buildFixture());

    expect(result.status).toBe('ok');
    expect(result.usesPlayerIds).toBe(true);
    expect(Object.keys(result.calculationData.Drivers)).toEqual(
      expect.arrayContaining(['116', '130', '11051', '11032', '114']),
    );
    expect(result.calculationData.Drivers['11032']).toMatchObject({
      DR: 'HAD',
      expectedPoints: INACTIVE_DRIVER_POINTS.regular,
      expectedPriceChange: 0,
      isActive: false,
    });
    expect(result.calculationData.Drivers['114']).toMatchObject({
      DR: 'LAW',
      expectedPoints: INACTIVE_DRIVER_POINTS.regular,
      expectedPriceChange: 0,
      isActive: false,
    });
    expect(result.calculationData.Drivers['116']).toMatchObject({
      DR: 'LAW',
      expectedPoints: 8.9,
      price: 14.5,
      isActive: true,
    });
    expect(result.calculationData.Drivers['999']).toBeUndefined();
    expect(result.calculationData.CurrentTeam.drivers).toEqual([
      '11032',
      '114',
      '11051',
    ]);
    expect(result.calculationData.CurrentTeam.boost).toBe('11051');
  });

  it('uses the sprint-weekend inactive penalty', () => {
    const result = prepareBestTeamsData(buildFixture('sprint'));

    expect(result.calculationData.Drivers['11032'].expectedPoints).toBe(
      INACTIVE_DRIVER_POINTS.sprint,
    );
    expect(result.calculationData.Drivers['114'].expectedPoints).toBe(
      INACTIVE_DRIVER_POINTS.sprint,
    );
  });

  it('requires weekend format only when an owned driver is inactive', () => {
    const fixture = buildFixture();
    delete fixture.nextRaceInfo;

    expect(prepareBestTeamsData(fixture)).toMatchObject({
      status: 'missing_weekend_format',
      inactiveDriverIds: ['11032', '114'],
    });
  });
});
