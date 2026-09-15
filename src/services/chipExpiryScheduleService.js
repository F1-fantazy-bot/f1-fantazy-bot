const { fetchCurrentSeasonRaces, buildDate } = require('../raceScheduleService');
const { RACE_GRACE_MS, FALLBACK_TTL_MS } = require('../utils/chipExpiry');

function scheduledCandidate(race) {
  const start = race?.sessions?.race
    ? Date.parse(race.sessions.race)
    : buildDate(race?.date, race?.time)?.getTime();

  return Number.isFinite(start) ? {
    start,
    raceId: race.season && race.round
      ? `${race.season}:${race.round}`
      : `${race.raceName || 'race'}:${new Date(start).toISOString()}`,
  } : null;
}

async function createChipExpiry({ cachedNextRaceInfo, now = Date.now() } = {}) {
  let candidates = [];
  try {
    const data = await fetchCurrentSeasonRaces({ signal: AbortSignal.timeout(2000) });
    candidates = (data?.MRData?.RaceTable?.Races || []).map(scheduledCandidate);
  } catch {
    // A bounded schedule failure does not block chip selection.
  }
  const eligible = (items) => items.filter((item) => item && item.start + RACE_GRACE_MS > now)
    .sort((a, b) => a.start - b.start)[0];
  const race = eligible(candidates) || eligible([scheduledCandidate(cachedNextRaceInfo)]);

  return {
    selectedAt: new Date(now).toISOString(),
    expiresAt: new Date(race ? race.start + RACE_GRACE_MS : now + FALLBACK_TTL_MS).toISOString(),
    ...(race ? { raceId: race.raceId } : {}),
  };
}

module.exports = { createChipExpiry };
