const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  simulationInfoCache,
  nextRaceInfoCache,
  pricesCache,
  sharedKey,
  getSelectedTeam,
  getBestTeamBudgetChangePointsPerMillion,
  getDriversForChat,
  getConstructorsForChat,
} = require('../../cache');
const { buildDataStatus } = require('../../cores/dataStatusCore');
const {
  getFreshLanguagePreference,
} = require('../../services/setLanguageService');
const {
  getUpcomingRaceIdentity,
} = require('../../services/simulationRaceStatusService');
const { ensureCacheReady } = require('../cacheBootstrap');
const { getAgentChatId } = require('../identity');
const { wrapToolExecute } = require('../wrapToolExecute');
const { localizeDataStatus } = require('./simulationStatusPresentation');

const getDataStatusTool = defineTool({
  name: 'get_data_status',
  description:
    'Show the authenticated user\'s cached F1 Fantasy data in a rich, safe card: simulation metadata, structured driver/constructor projections, saved rosters, selected chip, readiness, and suggested next actions. This takes no arguments. It never returns raw cache JSON, storage paths, credentials, or arbitrary internal entities.',
  parameters: z.object({}),
  execute: wrapToolExecute('get_data_status', async () => {
    await ensureCacheReady();
    const chatId = getAgentChatId();
    const [{ lang }, nextRaceInfo] = await Promise.all([
      getFreshLanguagePreference(chatId),
      getUpcomingRaceIdentity({
        cachedNextRaceInfo: nextRaceInfoCache[sharedKey],
      }),
    ]);
    const hasPersonalProjectionData = Boolean(
      driversCache[chatId] || constructorsCache[chatId],
    );
    const ppmByTeam = Object.fromEntries(
      Object.keys(currentTeamCache[chatId] || {}).map((teamId) => [
        teamId,
        getBestTeamBudgetChangePointsPerMillion(chatId, teamId),
      ]),
    );

    const dataStatus = buildDataStatus({
        simulationInfo: simulationInfoCache[sharedKey],
        sharedDrivers: driversCache[sharedKey],
        sharedConstructors: constructorsCache[sharedKey],
        drivers: getDriversForChat(chatId),
        constructors: getConstructorsForChat(chatId),
        pricesMetadata: pricesCache.metadata,
        nextRaceInfo,
        teams: currentTeamCache[chatId],
        selectedTeamId: getSelectedTeam(chatId),
        chipsByTeam: selectedChipCache[chatId],
        ppmByTeam,
        projectionSource: hasPersonalProjectionData
          ? 'personal_or_mixed'
          : 'simulation',
      });

    return {
      ...localizeDataStatus(dataStatus, lang),
      lang,
    };
  }),
});

module.exports = { getDataStatusTool };
