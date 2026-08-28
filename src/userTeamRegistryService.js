const azureStorageService = require('./azureStorageService');

async function saveUserTeam(chatId, teamId, teamData) {
  await azureStorageService.saveUserTeam(
    null,
    chatId,
    teamId,
    teamData,
    { silent: true },
  );
}

async function deleteUserTeam(chatId, teamId) {
  await azureStorageService.deleteUserTeam(
    null,
    chatId,
    teamId,
    { silent: true },
  );
}

async function deleteAllUserTeams(chatId) {
  await azureStorageService.deleteAllUserTeams(
    null,
    chatId,
    { silent: true },
  );
}

async function listUserTeams(chatId) {
  return await azureStorageService.listUserTeamData(chatId);
}

module.exports = {
  saveUserTeam,
  deleteUserTeam,
  deleteAllUserTeams,
  listUserTeams,
};
