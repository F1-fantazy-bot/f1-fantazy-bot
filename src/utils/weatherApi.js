// Utility to fetch weather forecast from Open-Meteo

const fetch = require('node-fetch');

/**
 * Fetches weather forecast for a given lat/lon and date.
 * Returns an object with temperature, precipitation probability, and wind speed for the specified date.
 * @param {number} lat
 * @param {number} lon
 * @param {Date} date - JS Date object (UTC)
 * @returns {Promise<{temperature: number, precipitation: number, wind: number}>}
 */
async function getWeatherForecast(lat, lon, date) {
  // Format date as YYYY-MM-DD
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,wind_speed_10m&start_date=${dateStr}&end_date=${dateStr}&timezone=UTC`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch weather data');
  }
  const data = await res.json();

  // Find the forecast for the exact hour/minute of the provided date (UTC)
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const targetIso = `${dateStr}T${hh}:${min}`;
  const hourIndex = data.hourly.time.findIndex((t) => t.startsWith(targetIso));

  return {
    temperature: data.hourly.temperature_2m[hourIndex],
    precipitation: data.hourly.precipitation_probability[hourIndex],
    wind: data.hourly.wind_speed_10m[hourIndex],
  };
}

module.exports = { getWeatherForecast };
