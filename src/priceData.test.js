const { applyPrices } = require('./priceData');

describe('priceData', () => {
  it('overlays prices and preserves projection fields', () => {
    const drivers = {
      VER: { DR: 'VER', price: 30.5, expectedPoints: 25, expectedPriceChange: 0.2 },
      HAM: { DR: 'HAM', price: 25, expectedPoints: 18, expectedPriceChange: -0.1 },
    };
    const constructors = {
      MER: { CN: 'MER', price: 15, expectedPoints: 20, expectedPriceChange: 0.3 },
    };

    const result = applyPrices(
      { drivers, constructors },
      {
        drivers: [
          { id: '1', name: 'M. Verstappen', price: 31.4 },
          { id: '44', name: 'L. Hamilton', price: 24.2 },
        ],
        constructors: [{ id: '28', name: 'Mercedes', price: 16.4 }],
      },
    );

    expect(result.drivers).toEqual({
      VER: { DR: 'VER', price: 31.4, expectedPoints: 25, expectedPriceChange: 0.2 },
      HAM: { DR: 'HAM', price: 24.2, expectedPoints: 18, expectedPriceChange: -0.1 },
    });
    expect(result.constructors).toEqual({
      MER: { CN: 'MER', price: 16.4, expectedPoints: 20, expectedPriceChange: 0.3 },
    });
    expect(result.priceMaps).toEqual({
      drivers: { VER: 31.4, HAM: 24.2 },
      constructors: { MER: 16.4 },
    });
    expect(result.report).toEqual({
      drivers: { unmapped: [], invalid: [], missing: [] },
      constructors: { unmapped: [], invalid: [], missing: [] },
    });
  });

  it('falls back to existing prices and reports invalid or unmapped price entries', () => {
    const result = applyPrices(
      {
        drivers: {
          VER: { DR: 'VER', price: 30.5 },
          HAM: { DR: 'HAM', price: 25 },
        },
        constructors: {
          MER: { CN: 'MER', price: 15 },
          RED: { CN: 'RED', price: 20 },
        },
      },
      {
        drivers: [
          { id: '1', name: 'M. Verstappen', price: 31.4 },
          { id: 'unknown', name: 'Unknown Driver', price: 10 },
          { id: '44', name: 'L. Hamilton', price: null },
        ],
        constructors: [
          { id: '28', name: 'Mercedes', price: 'bad' },
          { id: '29', name: 'Red Bull Racing', price: 21.3 },
        ],
      },
    );

    expect(result.drivers.VER.price).toBe(31.4);
    expect(result.drivers.HAM.price).toBe(25);
    expect(result.constructors.MER.price).toBe(15);
    expect(result.constructors.RED.price).toBe(21.3);
    expect(result.report).toEqual({
      drivers: {
        unmapped: ['Unknown Driver'],
        invalid: ['L. Hamilton'],
        missing: ['HAM'],
      },
      constructors: {
        unmapped: [],
        invalid: ['Mercedes'],
        missing: ['MER'],
      },
    });
  });
});
