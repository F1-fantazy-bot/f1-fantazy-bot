const {
  fetchCurrentSeasonRaces,
  filterUpcomingRaces,
} = require('../raceScheduleService');

// Returns the upcoming races for the current season as raw structured
// data. The Telegram adapter and the agent tool both consume this.
async function getNextRaces() {
  const data = await fetchCurrentSeasonRaces();
  const races = data?.MRData?.RaceTable?.Races || [];
  const season = data?.MRData?.RaceTable?.season;
  const upcomingRaces = filterUpcomingRaces(races);

  return {
    season,
    races: upcomingRaces,
    counts: {
      total: upcomingRaces.length,
      sprint: upcomingRaces.filter((race) => Boolean(race.Sprint)).length,
    },
  };
}

module.exports = { getNextRaces };
