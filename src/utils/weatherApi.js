// Utility to fetch weather forecast from Open-Meteo

const fetch = require('node-fetch');

/**
 * Fetches weather forecast for multiple given lat/lon and dates.
 * Returns a map with ISO string keys and forecast objects as values.
 * @param {number} lat
 * @param {number} lon
 * @param {Date[]} datesToFetch - Array of JS Date objects (UTC)
 * @returns {Promise<Object<string, {temperature: number, precipitation: number, wind: number, humidity: number, precipitation_mm: number}>>}
 */
async function getWeatherForecast(lat, lon, ...datesToFetch) {
  if (!Array.isArray(datesToFetch) || datesToFetch.length === 0) {
    throw new Error('datesToFetch must be a non-empty array of Date objects');
  }

  // Find min and max dates for API range
  const sortedDates = datesToFetch.slice().sort((a, b) => a - b);
  const apiStartDate = sortedDates[0];
  const apiEndDate = sortedDates[sortedDates.length - 1];
  const startDateStr = formatToYYYYMMDD(apiStartDate);
  const endDateStr = formatToYYYYMMDD(apiEndDate);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,relativehumidity_2m&start_date=${startDateStr}&end_date=${endDateStr}&timezone=UTC`;

  // Set up a 30-second timeout using AbortController
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Weather API request timed out after 30 seconds');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error('Failed to fetch weather data');
  }
  const data = await res.json();

  // Map each date's ISO string to its forecast
  const forecastsMap = {};
  for (const date of datesToFetch) {
    forecastsMap[date.toISOString()] = extractHourlyForecast(data, date);
  }

  return forecastsMap;
}

// Helper to format date as YYYY-MM-DD
function formatToYYYYMMDD(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

// Helper to extract forecast for a specific date/time
function extractHourlyForecast(apiData, targetDate) {
  const yyyy = targetDate.getUTCFullYear();
  const mm = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const hh = String(targetDate.getUTCHours()).padStart(2, '0');
  // Open-Meteo hourly data is typically at the start of the hour
  const targetIso = `${dateStr}T${hh}:00`;
  const hourIndex = apiData.hourly.time.findIndex((t) => t === targetIso);

  if (hourIndex === -1) {
    // Not found, return nulls
    return {
      temperature: null,
      precipitation: null,
      wind: null,
      humidity: null,
      precipitation_mm: null,
    };
  }

  return {
    temperature: apiData.hourly.temperature_2m[hourIndex],
    precipitation: apiData.hourly.precipitation_probability[hourIndex],
    wind: apiData.hourly.wind_speed_10m[hourIndex],
    humidity: apiData.hourly.relativehumidity_2m[hourIndex],
    precipitation_mm: apiData.hourly.precipitation[hourIndex],
  };
}

module.exports = { getWeatherForecast };
