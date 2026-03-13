const azureStorageService = require('../azureStorageService');
const {
  EXTRA_DRS_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
} = require('../constants');
const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  bestTeamsCache,
  selectedChipCache,
  userCache,
} = require('../cache');
const { updateUserAttributes } = require('../userRegistryService');
const { t } = require('../i18n');

const VALID_CHIPS = new Set([
  EXTRA_DRS_CHIP,
  WILDCARD_CHIP,
  LIMITLESS_CHIP,
]);

// Handles the case when the message text is JSON data
async function handleJsonMessage(bot, chatId, jsonData) {
  const normalizedSnapshot = normalizeCacheSnapshot(jsonData);

  if (!normalizedSnapshot) {
    await sendInvalidSnapshotMessage(bot, chatId);

    return;
  }

  delete bestTeamsCache[chatId];

  if (normalizedSnapshot.driversMap) {
    driversCache[chatId] = normalizedSnapshot.driversMap;
  } else {
    delete driversCache[chatId];
  }

  if (normalizedSnapshot.constructorsMap) {
    constructorsCache[chatId] = normalizedSnapshot.constructorsMap;
  } else {
    delete constructorsCache[chatId];
  }

  if (normalizedSnapshot.teamsMap) {
    currentTeamCache[chatId] = normalizedSnapshot.teamsMap;
  } else {
    delete currentTeamCache[chatId];
  }

  if (normalizedSnapshot.selectedChips) {
    selectedChipCache[chatId] = normalizedSnapshot.selectedChips;
  } else {
    delete selectedChipCache[chatId];
  }

  const key = String(chatId);
  if (!userCache[key]) {
    userCache[key] = {};
  }
  userCache[key].selectedTeam = normalizedSnapshot.selectedTeam;
  userCache[key].bestTeamPointsWeights =
    normalizedSnapshot.bestTeamPointsWeights;

  await azureStorageService.deleteAllUserTeams(bot, chatId);

  for (const [teamId, teamData] of Object.entries(
    normalizedSnapshot.teamsMap || {},
  )) {
    await azureStorageService.saveUserTeam(bot, chatId, teamId, teamData);
  }

  await updateUserAttributes(chatId, {
    selectedTeam: normalizedSnapshot.selectedTeam,
    bestTeamPointsWeights: JSON.stringify(
      normalizedSnapshot.bestTeamPointsWeights,
    ),
  });

  await sendImportSuccessMessage(bot, chatId);
}

function normalizeCacheSnapshot(jsonData) {
  if (!isPlainObject(jsonData) || 'CurrentTeam' in jsonData) {
    return null;
  }

  if (
    !Object.prototype.hasOwnProperty.call(jsonData, 'Drivers') ||
    !Array.isArray(jsonData.Drivers) ||
    !Object.prototype.hasOwnProperty.call(jsonData, 'Constructors') ||
    !Array.isArray(jsonData.Constructors) ||
    !Object.prototype.hasOwnProperty.call(jsonData, 'SelectedTeam') ||
    !Object.prototype.hasOwnProperty.call(jsonData, 'Teams') ||
    !isPlainObject(jsonData.Teams)
  ) {
    return null;
  }

  const driversMap = {};
  for (const driver of jsonData.Drivers) {
    if (!isPlainObject(driver) || !isNonEmptyString(driver.DR)) {
      return null;
    }
    driversMap[driver.DR] = driver;
  }

  const constructorsMap = {};
  for (const constructor of jsonData.Constructors) {
    if (!isPlainObject(constructor) || !isNonEmptyString(constructor.CN)) {
      return null;
    }
    constructorsMap[constructor.CN] = constructor;
  }

  const teamsMap = {};
  const bestTeamPointsWeights = {};
  const selectedChips = {};

  for (const [teamId, teamSnapshot] of Object.entries(jsonData.Teams)) {
    if (!isNonEmptyString(teamId) || !isValidTeamSnapshot(teamSnapshot)) {
      return null;
    }

    const {
      chip,
      bestTeamPointsWeight,
      ...teamDataWithoutMetadata
    } = teamSnapshot;

    teamsMap[teamId] = teamDataWithoutMetadata;
    bestTeamPointsWeights[teamId] = bestTeamPointsWeight;

    if (chip !== undefined) {
      selectedChips[teamId] = chip;
    }
  }

  if (
    jsonData.SelectedTeam !== null &&
    (!isNonEmptyString(jsonData.SelectedTeam) ||
      !Object.prototype.hasOwnProperty.call(teamsMap, jsonData.SelectedTeam))
  ) {
    return null;
  }

  return {
    driversMap:
      Object.keys(driversMap).length > 0 ? driversMap : null,
    constructorsMap:
      Object.keys(constructorsMap).length > 0 ? constructorsMap : null,
    teamsMap: Object.keys(teamsMap).length > 0 ? teamsMap : null,
    selectedChips:
      Object.keys(selectedChips).length > 0 ? selectedChips : null,
    bestTeamPointsWeights,
    selectedTeam: jsonData.SelectedTeam,
  };
}

function isValidTeamSnapshot(teamSnapshot) {
  if (!isPlainObject(teamSnapshot)) {
    return false;
  }

  if (
    !Array.isArray(teamSnapshot.drivers) ||
    !teamSnapshot.drivers.every(isNonEmptyString) ||
    !Array.isArray(teamSnapshot.constructors) ||
    !teamSnapshot.constructors.every(isNonEmptyString) ||
    !isNonEmptyString(teamSnapshot.drsBoost) ||
    !Number.isFinite(teamSnapshot.freeTransfers) ||
    !Number.isFinite(teamSnapshot.costCapRemaining) ||
    !Number.isFinite(teamSnapshot.bestTeamPointsWeight)
  ) {
    return false;
  }

  if (
    teamSnapshot.chip !== undefined &&
    !VALID_CHIPS.has(teamSnapshot.chip)
  ) {
    return false;
  }

  return true;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

async function sendInvalidSnapshotMessage(bot, chatId) {
  await bot
    .sendMessage(
      chatId,
      t(
        'Invalid cache snapshot. Paste the JSON output of /print_cache.',
        chatId,
      ),
    )
    .catch((err) =>
      console.error('Error sending invalid cache snapshot message:', err),
    );
}

async function sendImportSuccessMessage(bot, chatId) {
  await bot
    .sendMessage(
      chatId,
      t('Cache data saved successfully', chatId),
    )
    .catch((err) =>
      console.error('Error sending cache import success message:', err),
    );
}

module.exports = { handleJsonMessage };
