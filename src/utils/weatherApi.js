// Utility to fetch weather forecast from Open-Meteo

const fetch = require('node-fetch');

/**
 * Fetches weather forecast for two given lat/lon and dates.
 * Returns an object with forecasts for both dates.
 * @param {number} lat
 * @param {number} lon
 * @param {Date} date1 - First JS Date object (UTC)
 * @param {Date} date2 - Second JS Date object (UTC)
 * @returns {Promise<{date1Forecast: {temperature: number, precipitation: number, wind: number}, date2Forecast: {temperature: number, precipitation: number, wind: number}}>}
 */
async function getWeatherForecast(lat, lon, date1, date2) {
  // Determine start and end dates for the API call
  const apiStartDate = date1 < date2 ? date1 : date2;
  const apiEndDate = date1 > date2 ? date1 : date2;
  const startDateStr = formatToYYYYMMDD(apiStartDate);
  const endDateStr = formatToYYYYMMDD(apiEndDate);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,wind_speed_10m&start_date=${startDateStr}&end_date=${endDateStr}&timezone=UTC`;

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

  const forecast1 = extractHourlyForecast(data, date1);
  const forecast2 = extractHourlyForecast(data, date2);

  return {
    date1Forecast: forecast1,
    date2Forecast: forecast2,
  };
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
    return { temperature: null, precipitation: null, wind: null };
  }

  return {
    temperature: apiData.hourly.temperature_2m[hourIndex],
    precipitation: apiData.hourly.precipitation_probability[hourIndex],
    wind: apiData.hourly.wind_speed_10m[hourIndex],
  };
}

module.exports = { getWeatherForecast };
