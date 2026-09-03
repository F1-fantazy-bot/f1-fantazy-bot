// Shared simulation-refresh service.
//
// The simulation and price feeds are durable shared inputs, while the caches
// they populate are process-local.  This module owns one in-flight promise per
// Node process so an overlapping Telegram command, agent confirmation, or
// startup refresh cannot publish competing partial snapshots.

const {
  driversCache,
  constructorsCache,
  simulationInfoCache,
  sharedKey,
  setPrices,
  clearPrices,
} = require('../cache');
const {
  sendLogMessage,
  sendErrorMessage,
  sendMessageToAdmins,
  validateJsonData,
} = require('../utils');
const {
  LOG_CHANNEL_ID,
  NAME_TO_CODE_DRIVERS_MAPPING,
  NAME_TO_CODE_CONSTRUCTORS_MAPPING,
} = require('../constants');
const { getFantasyData, getPricesData } = require('../azureStorageService');
const { applyPrices } = require('../priceData');

const SHARED_SIMULATION_SOURCE = Object.freeze({
  kind: 'durable_shared_source',
  label: 'F1 Fantasy simulation data',
});

function asFiniteMatchday(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const matchday = Number(value);

  return Number.isFinite(matchday) ? matchday : null;
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function callEvent(events, name, message) {
  if (typeof events?.[name] !== 'function') {
    return Promise.resolve();
  }

  return events[name](message);
}

async function reportPriceDataGaps(events, report) {
  const messages = [];
  const addMessage = (label, values) => {
    if (Array.isArray(values) && values.length > 0) {
      messages.push(`${label}: ${values.join(', ')}`);
    }
  };

  addMessage('Driver prices not mapped from prices.json', report?.drivers?.unmapped);
  addMessage('Driver prices invalid in prices.json', report?.drivers?.invalid);
  addMessage(
    'Drivers missing from prices.json, using fallback prices',
    report?.drivers?.missing,
  );
  addMessage(
    'Constructor prices not mapped from prices.json',
    report?.constructors?.unmapped,
  );
  addMessage(
    'Constructor prices invalid in prices.json',
    report?.constructors?.invalid,
  );
  addMessage(
    'Constructors missing from prices.json, using fallback prices',
    report?.constructors?.missing,
  );

  if (messages.length === 0) {
    return;
  }

  await callEvent(
    events,
    'error',
    `\n🔴🔴🔴\nPrice data gaps:\n${messages.join('\n')}\n🔴🔴🔴`,
  );
}

function createSimulationRefreshService({
  fetchFantasyData,
  fetchPricesData,
  validateFantasyData,
  applyCanonicalPrices,
  cache,
  driverCodes,
  constructorCodes,
  now = () => new Date(),
}) {
  let inFlight = null;

  async function refreshOnce({ events, context } = {}) {
    const fantasyDataJson = await fetchFantasyData();

    await callEvent(
      events,
      'info',
      `Fantasy data json downloaded successfully. Simulation: ${
        fantasyDataJson?.SimulationName
      }${
        fantasyDataJson?.SimulationLastUpdate
          ? ` (Last updated: ${fantasyDataJson.SimulationLastUpdate})`
          : ''
      }`,
    );

    const isValid = await validateFantasyData(fantasyDataJson, context);
    if (!isValid) {
      throw new Error('Fantasy data validation failed');
    }

    cache.simulationInfoCache[cache.sharedKey] = {
      name: fantasyDataJson.SimulationName,
      lastUpdate: fantasyDataJson.SimulationLastUpdate || null,
    };

    const drivers = Object.fromEntries(
      fantasyDataJson.Drivers.map((driver) => [driver.DR, driver]),
    );
    const constructors = Object.fromEntries(
      fantasyDataJson.Constructors.map((constructor) => [
        constructor.CN,
        constructor,
      ]),
    );
    cache.driversCache[cache.sharedKey] = drivers;
    cache.constructorsCache[cache.sharedKey] = constructors;

    const unmappedDrivers = Object.keys(drivers).filter(
      (code) => !driverCodes.has(code),
    );
    const unmappedConstructors = Object.keys(constructors).filter(
      (code) => !constructorCodes.has(code),
    );

    let matchday = null;
    let priceSource = 'simulation';
    try {
      const pricesData = await fetchPricesData();
      const pricedData = applyCanonicalPrices({ drivers, constructors }, pricesData);

      cache.driversCache[cache.sharedKey] = pricedData.drivers;
      cache.constructorsCache[cache.sharedKey] = pricedData.constructors;
      cache.setPrices({
        drivers: pricedData.priceMaps.drivers,
        constructors: pricedData.priceMaps.constructors,
        driverEntries: pricesData.drivers,
        constructorEntries: pricesData.constructors,
        metadata: {
          fetchedAt: pricesData.fetchedAt || null,
          matchdayId: pricesData.matchdayId || null,
        },
      });
      matchday = asFiniteMatchday(pricesData.matchdayId);
      priceSource = 'canonical_prices';

      await callEvent(
        events,
        'info',
        `Prices data loaded successfully${
          pricesData?.matchdayId
            ? ` for matchday ${pricesData.matchdayId}`
            : ''
        }`,
      );
      await reportPriceDataGaps(events, pricedData.report);
    } catch (error) {
      cache.clearPrices();
      await callEvent(
        events,
        'error',
        `Failed to load prices data; falling back to simulation prices: ${error.message}`,
      );
    }

    if (unmappedDrivers.length > 0) {
      const message = `\n🔴🔴🔴\nDrivers not found in mapping: ${unmappedDrivers.join(', ')}\n🔴🔴🔴`;

      await callEvent(events, 'error', message);
      await callEvent(events, 'admins', message);
    }
    if (unmappedConstructors.length > 0) {
      const message = `\n🔴🔴🔴\nConstructors not found in mapping: ${unmappedConstructors.join(', ')}\n🔴🔴🔴`;

      await callEvent(events, 'error', message);
      await callEvent(events, 'admins', message);
    }

    return {
      status: 'ok',
      source: { ...SHARED_SIMULATION_SOURCE },
      fetchedAt: toIso(now()),
      matchday,
      counts: {
        drivers: Object.keys(cache.driversCache[cache.sharedKey] || {}).length,
        constructors: Object.keys(cache.constructorsCache[cache.sharedKey] || {})
          .length,
      },
      prices: { source: priceSource },
    };
  }

  function refresh(options = {}) {
    if (inFlight) {
      return inFlight;
    }

    inFlight = refreshOnce(options).finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  return { refresh };
}

function createDefaultEvents(bot) {
  return {
    info: (message) => sendLogMessage(bot, message),
    error: (message) => sendErrorMessage(bot, message),
    admins: (message) => sendMessageToAdmins(bot, message),
  };
}

const defaultSimulationRefreshService = createSimulationRefreshService({
  fetchFantasyData: getFantasyData,
  fetchPricesData: getPricesData,
  validateFantasyData: (data, context) =>
    validateJsonData(context?.bot, data, LOG_CHANNEL_ID, false),
  applyCanonicalPrices: applyPrices,
  cache: {
    driversCache,
    constructorsCache,
    simulationInfoCache,
    sharedKey,
    setPrices,
    clearPrices,
  },
  driverCodes: new Set(Object.values(NAME_TO_CODE_DRIVERS_MAPPING)),
  constructorCodes: new Set(Object.values(NAME_TO_CODE_CONSTRUCTORS_MAPPING)),
});

function refreshSimulationData({ bot } = {}) {
  // validateJsonData historically received the caller's Telegram bot so its
  // diagnostics land on the same operational channels, while the refresh
  // promise itself remains shared by every caller in this Node process.
  return defaultSimulationRefreshService.refresh({
    events: createDefaultEvents(bot),
    context: { bot },
  });
}

module.exports = {
  SHARED_SIMULATION_SOURCE,
  createSimulationRefreshService,
  refreshSimulationData,
};
