// Resolves the race identity used by simulation-status cards. The live F1
// schedule is authoritative; next-race-info.json is only a fallback when its
// race session is still in the future. This keeps an old stored race card from
// making an old simulation look current.

const { buildDate, fetchNextRace } = require('../raceScheduleService');

function safeString(value, maxLength = 120) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function normalizeScheduleRace(race) {
  if (!race || typeof race !== 'object' || Array.isArray(race)) {
    return null;
  }

  const raceName = safeString(race.raceName);
  if (!raceName) {
    return null;
  }

  return {
    raceName,
    circuitName: safeString(race.Circuit?.circuitName),
    location: {
      locality: safeString(race.Circuit?.Location?.locality),
    },
  };
}

function isFutureCachedRace(nextRaceInfo, now = Date.now()) {
  const sessions = nextRaceInfo?.sessions;
  const raceSession = sessions?.race;
  const raceDate =
    typeof raceSession === 'string'
      ? new Date(raceSession)
      : buildDate(nextRaceInfo?.date, nextRaceInfo?.time);

  return Number.isFinite(raceDate?.getTime()) && raceDate.getTime() >= now;
}

async function getUpcomingRaceIdentity({ cachedNextRaceInfo, now } = {}) {
  try {
    const scheduledRace = normalizeScheduleRace(await fetchNextRace());
    if (scheduledRace) {
      return scheduledRace;
    }
  } catch {
    // A schedule outage must not turn a read-only diagnostic into a tool
    // failure. The fallback below is accepted only if it is demonstrably
    // future-facing.
  }

  return isFutureCachedRace(cachedNextRaceInfo, now)
    ? cachedNextRaceInfo
    : null;
}

module.exports = {
  getUpcomingRaceIdentity,
  isFutureCachedRace,
  normalizeScheduleRace,
};
