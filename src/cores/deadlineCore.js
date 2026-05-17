const { fetchNextRace } = require('../raceScheduleService');
const { getDeadlineSession } = require('../commandsHandler/deadlineHandler');

// Returns the deadline snapshot for the agent. The live countdown is
// computed on the client; the server provides absolute timestamps
// (`sessionStartsAt`, `nowIso`) plus an `alreadyStarted` flag. The
// Telegram surface keeps its existing message-building helpers
// (`buildDeadlineMessage`, `getDeadlinePayload`) in `deadlineHandler.js`
// — this core is additive.
async function getDeadlineSnapshot({ now = new Date() } = {}) {
  const race = await fetchNextRace();

  if (!race) {
    return {
      status: 'unavailable',
      nowIso: now.toISOString(),
    };
  }

  const session = getDeadlineSession(race);

  if (!session?.startsAt) {
    return {
      status: 'unavailable',
      raceName: race.raceName,
      nowIso: now.toISOString(),
    };
  }

  const alreadyStarted = session.startsAt.getTime() - now.getTime() <= 0;

  return {
    status: 'ok',
    raceName: race.raceName,
    sessionType: session.type,
    sessionLabel: session.label,
    sessionStartsAt: session.startsAt.toISOString(),
    nowIso: now.toISOString(),
    alreadyStarted,
  };
}

module.exports = { getDeadlineSnapshot };
