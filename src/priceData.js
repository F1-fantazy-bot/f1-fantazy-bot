const {
  NAME_TO_CODE_DRIVERS_MAPPING,
  NAME_TO_CODE_CONSTRUCTORS_MAPPING,
} = require('./constants');

function buildPriceMap(entries, nameToCodeMapping) {
  const pricesByCode = {};
  const unmapped = [];
  const invalid = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    const code = nameToCodeMapping[name.toLowerCase()];
    const rawPrice = entry?.price;
    const price =
      rawPrice === null || rawPrice === undefined || rawPrice === ''
        ? NaN
        : Number(rawPrice);

    if (!code) {
      unmapped.push(name || String(entry?.id || 'unknown'));
      continue;
    }

    if (!Number.isFinite(price)) {
      invalid.push(name || code);
      continue;
    }

    pricesByCode[code] = price;
  }

  return { pricesByCode, unmapped, invalid };
}

function overlayPrices(itemsByCode, pricesByCode, codeField) {
  const missing = [];
  const overlaid = {};

  for (const [code, item] of Object.entries(itemsByCode || {})) {
    const canonicalCode = item?.[codeField] || code;
    const price = pricesByCode[canonicalCode];

    if (Number.isFinite(price)) {
      overlaid[code] = { ...item, price };
    } else {
      overlaid[code] = item;
      missing.push(canonicalCode);
    }
  }

  return { items: overlaid, missing };
}

function applyPrices({ drivers, constructors }, pricesData) {
  const driverPrices = buildPriceMap(
    pricesData?.drivers,
    NAME_TO_CODE_DRIVERS_MAPPING,
  );
  const constructorPrices = buildPriceMap(
    pricesData?.constructors,
    NAME_TO_CODE_CONSTRUCTORS_MAPPING,
  );

  const driverOverlay = overlayPrices(
    drivers,
    driverPrices.pricesByCode,
    'DR',
  );
  const constructorOverlay = overlayPrices(
    constructors,
    constructorPrices.pricesByCode,
    'CN',
  );

  return {
    drivers: driverOverlay.items,
    constructors: constructorOverlay.items,
    priceMaps: {
      drivers: driverPrices.pricesByCode,
      constructors: constructorPrices.pricesByCode,
    },
    report: {
      drivers: {
        unmapped: driverPrices.unmapped,
        invalid: driverPrices.invalid,
        missing: driverOverlay.missing,
      },
      constructors: {
        unmapped: constructorPrices.unmapped,
        invalid: constructorPrices.invalid,
        missing: constructorOverlay.missing,
      },
    },
  };
}

module.exports = {
  applyPrices,
  buildPriceMap,
};
