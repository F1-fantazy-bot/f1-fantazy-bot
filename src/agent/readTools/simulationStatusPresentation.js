// Agent-tool presentation boundary: the shared cores retain ISO timestamps so
// Telegram keeps its existing behavior, while web-agent results expose only a
// saved-language, Asia/Jerusalem display time.

const { formatUserLocalDateTime } = require('../../utils/userFacingTime');

function localizeFreshness(freshness, lang) {
  const value = freshness || {};

  return {
    status: value.status || 'unknown',
    updatedAtLocal: formatUserLocalDateTime(value.updatedAt, lang),
  };
}

function localizeSimulationStatus(status, lang) {
  const { lastUpdate: _lastUpdate, freshness, ...safeStatus } = status;

  return {
    ...safeStatus,
    freshness: localizeFreshness(freshness, lang),
  };
}

function localizeDataStatus(status, lang) {
  return {
    ...status,
    simulation: status.simulation
      ? {
          ...status.simulation,
          freshness: localizeFreshness(status.simulation.freshness, lang),
        }
      : status.simulation,
  };
}

module.exports = {
  localizeFreshness,
  localizeSimulationStatus,
  localizeDataStatus,
};
