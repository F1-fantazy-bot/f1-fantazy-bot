const { sendLogMessage } = require('../utils');
const { formatDateTime } = require('../utils/utils');
const { t } = require('../i18n');
const { MAX_TELEGRAM_MESSAGE_LENGTH } = require('../constants');

const NEXT_RACES_ENDPOINT = 'https://api.jolpi.ca/ergast/f1/current/';

const SESSION_CONFIG = [
  { key: 'FirstPractice', label: 'FP1' },
  { key: 'SecondPractice', label: 'FP2' },
  { key: 'ThirdPractice', label: 'FP3' },
  { key: 'SprintQualifying', label: 'Sprint Qualifying' },
  { key: 'Sprint', label: 'Sprint' },
  { key: 'Qualifying', label: 'Qualifying' },
];

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

function formatSession(sessionData, label, chatId) {
  if (!sessionData || !sessionData.date) {
    return null;
  }

  const sessionDate = buildDate(sessionData.date, sessionData.time);
  if (!sessionDate) {
    return `${label}: ${t('TBD', chatId)}`;
  }

  const { dateStr, timeStr } = formatDateTime(sessionDate, chatId);

  return `${label}: ${dateStr} - ${timeStr}`;
}

function formatCountdown(targetDate) {
  if (!targetDate) {
    return 'TBD';
  }

  const diffMs = targetDate - new Date();
  if (diffMs <= 0) {
    return '0m';
  }

  const minutesInHour = 60;
  const minutesInDay = 24 * minutesInHour;
  const minutesInWeek = 7 * minutesInDay;
  const minutesInMonth = 30 * minutesInDay; // approximate month

  let remainingMinutes = Math.floor(diffMs / 60000);

  const months = Math.floor(remainingMinutes / minutesInMonth);
  remainingMinutes -= months * minutesInMonth;

  const weeks = Math.floor(remainingMinutes / minutesInWeek);
  remainingMinutes -= weeks * minutesInWeek;

  const days = Math.floor(remainingMinutes / minutesInDay);
  remainingMinutes -= days * minutesInDay;

  const hours = Math.floor(remainingMinutes / minutesInHour);
  const minutes = remainingMinutes % minutesInHour;

  const parts = [];
  if (months > 0) {
    parts.push(`${months}mo`);
  }
  if (weeks > 0) {
    parts.push(`${weeks}w`);
  }
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (parts.length === 0 && minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (parts.length === 0) {
    parts.push('0m');
  }

  return parts.join(' ');
}

function buildRaceBlock(race, chatId) {
  const raceDate = buildDate(race.date, race.time);
  let raceDateLine = t('TBD', chatId);
  if (raceDate) {
    const { dateStr, timeStr } = formatDateTime(raceDate, chatId);
    raceDateLine = `${dateStr} - ${timeStr}`;
  }

  let block = `**${t('Round {ROUND}: {NAME}', chatId, {
    ROUND: race.round,
    NAME: race.raceName,
  })}** \n`;

  if (race.Circuit?.circuitName) {
    block += `📍 ${t('Circuit', chatId)}: ${race.Circuit.circuitName}\n`;
  }

  if (race.Circuit?.Location) {
    const { locality, country } = race.Circuit.Location;
    if (locality || country) {
      block += `🌍 ${t('Location', chatId)}: ${
        locality ? `${locality}${country ? `, ${country}` : ''}` : country
      }\n`;
    }
  }

  block += `🏁 ${t('Race', chatId)}: ${raceDateLine}\n`;
  block += `⏳ ${t('Countdown', chatId)}: ${formatCountdown(raceDate)}\n`;

  const sessionLines = SESSION_CONFIG.reduce((acc, { key, label }) => {
    if (race[key]) {
      const sessionLine = formatSession(race[key], t(label, chatId), chatId);
      if (sessionLine) {
        acc.push(sessionLine);
      }
    }

    return acc;
  }, []);

  if (sessionLines.length > 0) {
    block += `📅 ${t('Sessions', chatId)}:\n`;
    sessionLines.forEach((line) => {
      block += `- ${line}\n`;
    });
  }

  block += '\n';

  return { text: block, raceDate };
}

async function fetchCurrentSeasonRaces() {
  const response = await fetch(NEXT_RACES_ENDPOINT);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function filterUpcomingRaces(races) {
  const now = new Date();

  return races.filter((race) => {
    const raceDate = buildDate(race.date, race.time);

    return raceDate && raceDate >= now;
  });
}

async function handleNextRacesCommand(bot, chatId) {
  try {
    const data = await fetchCurrentSeasonRaces();
    const races = data?.MRData?.RaceTable?.Races || [];
    const season = data?.MRData?.RaceTable?.season;

    const upcomingRaces = filterUpcomingRaces(races);

    if (upcomingRaces.length === 0) {
      await bot
        .sendMessage(
          chatId,
          t('No upcoming races found for this season.', chatId)
        )
        .catch((err) =>
          console.error('Error sending no upcoming races message:', err)
        );

      return;
    }

    const headerSeasonSuffix = season ? ` - ${season}` : '';
    const header = `*${t('Upcoming Races', chatId)}${headerSeasonSuffix}*\n\n`;
    const continuedHeader = `*${t('Upcoming Races (continued)', chatId)}*\n\n`;

    const raceBlocks = upcomingRaces.map(
      (race) => buildRaceBlock(race, chatId).text
    );

    const messages = [];
    let currentMessage = header;

    raceBlocks.forEach((block) => {
      if (currentMessage.length + block.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
        messages.push(currentMessage.trimEnd());
        currentMessage = continuedHeader;
      }

      currentMessage += block;
    });

    if (currentMessage.trim().length > 0) {
      messages.push(currentMessage.trimEnd());
    }

    for (const message of messages) {
      await bot
        .sendMessage(chatId, message, { parse_mode: 'Markdown' })
        .catch((err) =>
          console.error('Error sending upcoming races message:', err)
        );
    }
  } catch (error) {
    console.error('Error handling next races command:', error);
    await sendLogMessage(
      bot,
      `Failed to fetch upcoming races: ${error.message}`
    );
    await bot
      .sendMessage(
        chatId,
        t('Unable to fetch upcoming races. Please try again later.', chatId)
      )
      .catch((err) =>
        console.error('Error sending upcoming races fallback message:', err)
      );
  }
}

module.exports = { handleNextRacesCommand };
