const NEXT_RACES_ENDPOINT = 'https://api.jolpi.ca/ergast/f1/current.json';
const NEXT_RACE_ENDPOINT = 'https://api.jolpi.ca/ergast/f1/current/next.json';

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

async function fetchCurrentSeasonRaces() {
  const response = await fetch(NEXT_RACES_ENDPOINT);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchNextRace() {
  const response = await fetch(NEXT_RACE_ENDPOINT);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  return data?.MRData?.RaceTable?.Races?.[0] || null;
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
  NEXT_RACES_ENDPOINT,
  NEXT_RACE_ENDPOINT,
  buildDate,
  fetchCurrentSeasonRaces,
  fetchNextRace,
  filterUpcomingRaces,
  fetchRemainingRaceCount,
};
