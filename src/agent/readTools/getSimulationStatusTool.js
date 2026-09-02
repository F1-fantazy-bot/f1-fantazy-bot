const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const {
  driversCache,
  constructorsCache,
  simulationInfoCache,
  nextRaceInfoCache,
  pricesCache,
  sharedKey,
} = require('../../cache');
const {
  buildProjectionData,
  buildSimulationStatus,
} = require('../../cores/simulationStatusCore');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  getUpcomingRaceIdentity,
} = require('../../services/simulationRaceStatusService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');
const {
  localizeSimulationStatus,
} = require('./simulationStatusPresentation');

const getSimulationStatusTool = defineTool({
  name: 'get_simulation_status',
  description:
    'Get the safe shared F1 Fantasy simulation status and its structured driver/constructor projections for a rich card. It returns source name, matchday when available, saved-language local freshness time, counts, and allowlisted projection fields (code, price, projected points, expected price change). This takes no arguments. It never returns raw cache JSON, storage details, credentials, or arbitrary cache fields.',
  parameters: z.object({}),
  execute: wrapToolExecute('get_simulation_status', async () => {
    await ensureCacheReady();
    const chatId = getAgentChatId();
    const [{ lang }, nextRaceInfo] = await Promise.all([
      getFreshLanguagePreference(chatId),
      getUpcomingRaceIdentity({
        cachedNextRaceInfo: nextRaceInfoCache[sharedKey],
      }),
    ]);

    const drivers = driversCache[sharedKey];
    const constructors = constructorsCache[sharedKey];
    const simulationStatus = buildSimulationStatus({
        simulationInfo: simulationInfoCache[sharedKey],
        drivers,
        constructors,
        pricesMetadata: pricesCache.metadata,
        nextRaceInfo,
      });

    return {
      ...localizeSimulationStatus(simulationStatus, lang),
      projections: buildProjectionData({ drivers, constructors }),
      lang,
    };
  }),
});

module.exports = { getSimulationStatusTool };
