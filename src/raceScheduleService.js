const { getRaceCalendar } = require('./azureStorageService');

function buildDate(dateStr, timeStr) {
  if (!dateStr) {
    return null;
  }

  let timeComponent = timeStr || '00:00:00Z';
  if (!/[zZ]$/.test(timeComponent)) {
    timeComponent += 'Z';
  }

  const isoString = `${dateStr}T${timeComponent}`;
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function fetchCurrentSeasonRaces(options) {
  const data = await getRaceCalendar(options);
  const year = String(new Date().getUTCFullYear());
  const mr = data?.MRData;
  const races = mr?.RaceTable?.Races;
  if (mr?.RaceTable?.season !== year || !Array.isArray(races) ||
    !races.length || mr.offset !== '0' || String(races.length) !== mr.total ||
    Number(mr.limit) < races.length || !Number.isFinite(Number(mr.limit)) ||
    !Number.isFinite(Date.parse(data.fetchedAt))) {
    throw new Error('Invalid cached F1 season calendar');
  }
  const validRounds = new Set(races.map((_, i) => String(i + 1)));
  for (const race of races) {
    if (race?.season !== year || !validRounds.delete(race.round) || !race.raceName ||
      !race.Circuit?.circuitId || !race.date?.startsWith(`${year}-`) ||
      buildDate(race.date)?.toISOString().slice(0, 10) !== race.date ||
      (race.time !== null && race.time !== undefined && (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(race.time) ||
        !buildDate(race.date, race.time)))) {
      throw new Error('Invalid race in cached F1 season calendar');
    }
  }

  return data;
}

async function fetchNextRace() {
  const data = await fetchCurrentSeasonRaces();
  const upcoming = filterUpcomingRaces(data.MRData.RaceTable.Races.filter((race) => race.time));
  upcoming.sort((a, b) => buildDate(a.date, a.time) - buildDate(b.date, b.time));

  return upcoming[0] || null;
}

function filterUpcomingRaces(races) {
  const now = new Date();

  return races.filter((race) => {
    const raceDate = buildDate(race.date, race.time);

    return raceDate && raceDate >= now;
  });
}

async function fetchRemainingRaceCount() {
  const data = await fetchCurrentSeasonRaces();
  const races = data?.MRData?.RaceTable?.Races || [];

  return filterUpcomingRaces(races).length;
}

module.exports = {
  buildDate,
  fetchCurrentSeasonRaces,
  fetchNextRace,
  filterUpcomingRaces,
  fetchRemainingRaceCount,
};
