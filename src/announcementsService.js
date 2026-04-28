const fs = require('fs');
const path = require('path');

const ANNOUNCEMENTS_FILE = path.join(
  __dirname,
  '..',
  'data',
  'announcements.json',
);

function loadAnnouncements() {
  let raw;
  try {
    raw = fs.readFileSync(ANNOUNCEMENTS_FILE, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return [];
    }
    console.error('Failed to read announcements file:', err);

    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse announcements file:', err);

    return [];
  }
}

function getLatestAnnouncement() {
  const entries = loadAnnouncements();
  if (entries.length === 0) {
    return null;
  }

  let latest = null;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (!latest) {
      latest = entry;
      continue;
    }
    const currentTime = Date.parse(entry.createdAt);
    const latestTime = Date.parse(latest.createdAt);
    if (Number.isFinite(currentTime) && Number.isFinite(latestTime)) {
      if (currentTime > latestTime) {
        latest = entry;
      }
    } else if (Number.isFinite(currentTime) && !Number.isFinite(latestTime)) {
      latest = entry;
    }
  }

  return latest;
}

module.exports = {
  ANNOUNCEMENTS_FILE,
  loadAnnouncements,
  getLatestAnnouncement,
};
