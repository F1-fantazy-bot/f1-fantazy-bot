// Pure chip lifetime helpers. Undated legacy selections are deliberately inactive.
const HOUR_MS = 60 * 60 * 1000;
const RACE_GRACE_MS = 12 * HOUR_MS;
const FALLBACK_TTL_MS = 5 * 24 * HOUR_MS;

function parseMap(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;

    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function normalizeChipExpiryByTeam(raw) {
  return Object.fromEntries(Object.entries(parseMap(raw)).filter(([, value]) => {
    const selected = typeof value?.selectedAt === 'string' ? Date.parse(value.selectedAt) : NaN;
    const expires = typeof value?.expiresAt === 'string' ? Date.parse(value.expiresAt) : NaN;

    return Number.isFinite(selected) && Number.isFinite(expires) && expires > selected;
  }).map(([teamId, value]) => [teamId, {
    selectedAt: new Date(value.selectedAt).toISOString(),
    expiresAt: new Date(value.expiresAt).toISOString(),
    ...(typeof value.raceId === 'string' ? { raceId: value.raceId } : {}),
  }]));
}

function resolveActiveChips(chips, metadata, now = Date.now()) {
  const expiry = normalizeChipExpiryByTeam(metadata);

  return Object.fromEntries(Object.entries(chips || {}).filter(([teamId]) =>
    expiry[teamId] && now < Date.parse(expiry[teamId].expiresAt),
  ));
}

function serializeChipExpiryByTeam(metadata) {
  const normalized = normalizeChipExpiryByTeam(metadata);

  return Object.keys(normalized).length ? JSON.stringify(normalized) : null;
}

module.exports = {
  RACE_GRACE_MS, FALLBACK_TTL_MS,
  normalizeChipExpiryByTeam, resolveActiveChips, serializeChipExpiryByTeam,
};
