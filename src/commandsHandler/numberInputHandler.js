const { calculateChangesToTeam } = require('../bestTeamsCalculator');
const {
  bestTeamsCache,
  driversCache,
  constructorsCache,
  selectedChipCache,
  sharedKey,
} = require('../cache');
const { COMMAND_BEST_TEAMS } = require('../constants');

// Handles the case when the message text is a number
async function handleNumberMessage(bot, chatId, textTrimmed) {
  const teamRowRequested = parseInt(textTrimmed, 10);

  if (bestTeamsCache[chatId]) {
    const currentTeam = bestTeamsCache[chatId].currentTeam;
    const selectedTeam = bestTeamsCache[chatId].bestTeams.find(
      (t) => t.row === teamRowRequested
    );

    if (selectedTeam) {
      if (
        selectedTeam.transfers_needed === 0 &&
        !selectedTeam.extra_drs_driver // if the user uses the extra drs chip we need to show the changes
      ) {
        await bot
          .sendMessage(
            chatId,
            `You are already at team ${teamRowRequested}. No changes needed.`
          )
          .catch((err) =>
            console.error('Error sending no changes message:', err)
          );

        return;
      }

      // Build cachedJsonData object
      const cachedJsonData = {
        Drivers: driversCache[chatId] || driversCache[sharedKey],
        Constructors: constructorsCache[chatId] || constructorsCache[sharedKey],
        CurrentTeam: currentTeam,
      };
      const changesToTeam = calculateChangesToTeam(
        cachedJsonData,
        selectedTeam,
        selectedChipCache[chatId]
      );

      let changesToTeamMessage = `*Team ${teamRowRequested} Required Changes:*\n`;
      if (changesToTeam.driversToAdd.length) {
        changesToTeamMessage += `*Drivers To Add:* ${changesToTeam.driversToAdd.join(
          ', '
        )}\n`;
      }

      if (changesToTeam.driversToRemove.length) {
        changesToTeamMessage += `*Drivers To Remove:* ${changesToTeam.driversToRemove.join(
          ', '
        )}\n`;
      }

      if (changesToTeam.constructorsToAdd.length) {
        changesToTeamMessage += `*Constructors To Add:* ${changesToTeam.constructorsToAdd.join(
          ', '
        )}\n`;
      }
      if (changesToTeam.constructorsToRemove.length) {
        changesToTeamMessage += `*Constructors To Remove:* ${changesToTeam.constructorsToRemove.join(
          ', '
        )}\n`;
      }

      if (changesToTeam.extraDrsDriver) {
        changesToTeamMessage += `*Extra DRS Driver:* ${changesToTeam.extraDrsDriver}\n`;
      }

      if (changesToTeam.newDRS !== undefined) {
        changesToTeamMessage += `*${
          changesToTeam.extraDrsDriver ? '' : 'New '
        }DRS Driver:* ${changesToTeam.newDRS}\n`;
      }

      const selectedChip = selectedChipCache[chatId];
      if (changesToTeam.chipToActivate !== undefined) {
        changesToTeamMessage += `*Chip To Activate:* ${selectedChip.replace(
          /_/g,
          ' '
        )}\n`;
      }

      if (changesToTeam.deltaPoints !== undefined) {
        changesToTeamMessage += `*Δ Points:* ${
          changesToTeam.deltaPoints > 0 ? '+' : ''
        }${changesToTeam.deltaPoints.toFixed(2)}\n`;
      }
      if (changesToTeam.deltaPrice !== undefined) {
        changesToTeamMessage += `*Δ Price:* ${
          changesToTeam.deltaPrice > 0 ? '+' : ''
        }${changesToTeam.deltaPrice.toFixed(2)}M`;
      }

      await bot
        .sendMessage(chatId, changesToTeamMessage, { parse_mode: 'Markdown' })
        .catch((err) =>
          console.error('Error sending changes to team message:', err)
        );
    } else {
      await bot
        .sendMessage(chatId, `No team found for number ${teamRowRequested}.`)
        .catch((err) =>
          console.error('Error sending team not found message:', err)
        );
    }
  } else {
    await bot
      .sendMessage(
        chatId,
        `No cached teams available. Please send full JSON data or images first and then run the ${COMMAND_BEST_TEAMS} command.`
      )
      .catch((err) =>
        console.error('Error sending cache unavailable message:', err)
      );
  }
}

module.exports = { handleNumberMessage };
