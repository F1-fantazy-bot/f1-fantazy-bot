const { t } = require('../i18n');
const {
  bestTeamsCache,
  currentTeamCache,
  getSelectedTeam,
  isLeagueTeamId,
} = require('../cache');
const { MAX_FOLLOWED_LEAGUE_TEAMS } = require('../constants');
const { buildLeagueTeamId } = require('../utils/teamId');
const {
  setCachedSelectedTeam,
} = require('./selectTeamService');
const {
  runChipMutation,
  clearTeamDerivedPreferences,
} = require('./activateChipService');
const {
  captureTeamState,
  restoreTeamStateWithStorage,
} = require('./teamStateSnapshotService');

const STATUS = Object.freeze({
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
  NOT_FOUND: 'not_found',
  LIMIT_EXCEEDED: 'limit_exceeded',
});

const ACTION = Object.freeze({
  ADD: 'add',
  REMOVE: 'remove',
});

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function availableLeagueSummary(leagues) {
  return leagues
    .map((league) =>
      `${league.leagueName || league.leagueCode} (${league.leagueCode})`,
    )
    .join(', ') || '—';
}

function teamChoice(league, team) {
  return {
    leagueCode: league.leagueCode,
    leagueName: league.leagueName || league.leagueCode,
    teamId: buildLeagueTeamId(team.userName, team.teamNo),
    teamName: team.teamName || team.userName,
    leagueTeam: team,
  };
}

function validatePorts(ports) {
  const requiredFunctions = [
    ['storage.listUserTeams', ports.storage?.listUserTeams],
    ['storage.saveUserTeam', ports.storage?.saveUserTeam],
    ['storage.deleteUserTeam', ports.storage?.deleteUserTeam],
    ['storage.deleteAllUserTeams', ports.storage?.deleteAllUserTeams],
    ['listUserLeagues', ports.listUserLeagues],
    ['loadLeagueTeamsData', ports.loadLeagueTeamsData],
    ['mapLeagueTeamToBotTeam', ports.mapLeagueTeamToBotTeam],
    ['sourceSwitcher', ports.sourceSwitcher],
  ];
  for (const [name, value] of requiredFunctions) {
    if (typeof value !== 'function') {
      throw new Error(`followTeamService: ${name} port is required`);
    }
  }
}

function createFollowTeamService(ports) {
  validatePorts(ports);
  const runMutation = ports.runMutation || runChipMutation;
  const clearPreferences =
    ports.clearTeamDerivedPreferences || clearTeamDerivedPreferences;
  const captureState = ports.captureTeamState || captureTeamState;
  const restoreState =
    ports.restoreTeamState ||
    ((chatId, snapshot) =>
      restoreTeamStateWithStorage(chatId, snapshot, ports.storage));
  const logger = ports.logger || (async () => {});

  async function inspect({
    chatId,
    action,
    leagueCode,
    teamId,
    teamName,
  }) {
    if (action !== ACTION.ADD && action !== ACTION.REMOVE) {
      return {
        status: STATUS.INVALID_INPUT,
        summary: t('Choose whether to add or remove a followed team.', chatId),
        changed: false,
      };
    }
    if (Boolean(teamId) === Boolean(teamName)) {
      return {
        status: STATUS.INVALID_INPUT,
        summary: t(
          'Provide exactly one team target: teamId or teamName.',
          chatId,
        ),
        changed: false,
      };
    }

    const leagues = await ports.listUserLeagues(chatId);
    const normalizedLeagueCode = normalize(leagueCode);
    const selectedLeagues = normalizedLeagueCode
      ? leagues.filter(
        (league) => normalize(league.leagueCode) === normalizedLeagueCode,
      )
      : action === ACTION.ADD
        ? []
        : leagues;
    if (
      (action === ACTION.ADD || normalizedLeagueCode) &&
      selectedLeagues.length === 0
    ) {
      return {
        status: STATUS.INVALID_INPUT,
        summary: t(
          'League {LEAGUE} is not followed. Followed leagues: {LEAGUES}.',
          chatId,
          {
            LEAGUE: leagueCode || '—',
            LEAGUES: availableLeagueSummary(leagues),
          },
        ),
        changed: false,
        followedLeagues: leagues,
      };
    }
    const storedTeams =
      (await ports.storage.listUserTeams(chatId)) || {};
    const followedTeamIds = Object.keys(storedTeams).filter(isLeagueTeamId);
    const screenshotTeamIds = Object.keys(storedTeams).filter(
      (id) => !isLeagueTeamId(id),
    );

    if (action === ACTION.REMOVE && teamId) {
      if (!followedTeamIds.includes(teamId)) {
        return {
          status: STATUS.NOT_FOUND,
          summary: t(
            'You are not following team {TEAM} ({TEAM_ID}). Followed team IDs: {TEAMS}.',
            chatId,
            {
              TEAM: storedTeams[teamId]?.teamName || teamId,
              TEAM_ID: teamId,
              TEAMS: followedTeamIds.join(', ') || '—',
            },
          ),
          teamId,
          teamName: storedTeams[teamId]?.teamName || teamId,
          leagueCode: selectedLeagues[0]?.leagueCode,
          leagueName:
            selectedLeagues[0]?.leagueName ||
            selectedLeagues[0]?.leagueCode,
          changed: false,
          followedTeamIds,
        };
      }

      return {
        status: STATUS.OK,
        leagueCode: selectedLeagues[0]?.leagueCode,
        leagueName:
          selectedLeagues[0]?.leagueName ||
          selectedLeagues[0]?.leagueCode,
        teamId,
        teamName: storedTeams[teamId]?.teamName || teamId,
        leagueTeam: null,
        changed: true,
        screenshotTeamIds,
        storedTeams,
      };
    }

    const choices = [];
    const leagueDataByCode = new Map();
    for (const league of selectedLeagues) {
      const data = await ports.loadLeagueTeamsData(league.leagueCode);
      leagueDataByCode.set(league.leagueCode, data);
      for (const team of Array.isArray(data?.teams) ? data.teams : []) {
        const choice = teamChoice(league, team);
        if (!choice.teamId) {
          continue;
        }
        const matches = teamId
          ? choice.teamId === teamId
          : normalize(choice.teamName) === normalize(teamName);
        if (matches) {
          choices.push(choice);
        }
      }
    }

    const uniqueChoices = [
      ...new Map(
        choices.map((choice) => [
          `${choice.leagueCode}:${choice.teamId}`,
          choice,
        ]),
      ).values(),
    ];
    const uniqueTeamIds = new Set(
      uniqueChoices.map((choice) => choice.teamId),
    );
    if (!teamId && uniqueTeamIds.size > 1) {
      return {
        status: STATUS.INVALID_INPUT,
        summary: t(
          'Multiple teams are named "{TEAM}". Choose an exact teamId and league: {TEAMS}.',
          chatId,
          {
            TEAM: teamName,
            TEAMS: uniqueChoices
              .map(
                (choice) =>
                  `${choice.teamName} (${choice.teamId}, ${choice.leagueCode})`,
              )
              .join(', '),
          },
        ),
        changed: false,
        availableTeams: uniqueChoices.map(
          ({ leagueTeam: _leagueTeam, ...choice }) => choice,
        ),
      };
    }
    if (uniqueChoices.length === 0) {
      return {
        status: STATUS.INVALID_INPUT,
        summary: t(
          'Team "{TEAM}" was not found in the current data for the requested followed league. Available teams: {TEAMS}.',
          chatId,
          {
            TEAM: teamId || teamName,
            TEAMS: selectedLeagues.flatMap((league) => {
              const data = leagueDataByCode.get(league.leagueCode);

              return (Array.isArray(data?.teams) ? data.teams : [])
                .map((team) => {
                  const id = buildLeagueTeamId(
                    team.userName,
                    team.teamNo,
                  );

                  return `${team.teamName || team.userName} (${id})`;
                });
            }).join(', ') || '—',
          },
        ),
        changed: false,
      };
    }

    const choice = uniqueChoices[0];
    const alreadyFollowed = followedTeamIds.includes(choice.teamId);

    if (action === ACTION.ADD && alreadyFollowed) {
      return {
        status: STATUS.OK,
        summary: t(
          'You already follow team {TEAM} ({TEAM_ID}).',
          chatId,
          { TEAM: choice.teamName, TEAM_ID: choice.teamId },
        ),
        ...choice,
        leagueTeam: undefined,
        changed: false,
        screenshotTeamIds,
      };
    }
    if (
      action === ACTION.ADD &&
      followedTeamIds.length >= MAX_FOLLOWED_LEAGUE_TEAMS
    ) {
      return {
        status: STATUS.LIMIT_EXCEEDED,
        summary: t(
          'You can follow at most {MAX} league teams. Remove one before adding {TEAM}.',
          chatId,
          {
            MAX: MAX_FOLLOWED_LEAGUE_TEAMS,
            TEAM: choice.teamName,
          },
        ),
        ...choice,
        leagueTeam: undefined,
        changed: false,
        followedTeamIds,
      };
    }
    if (action === ACTION.REMOVE && !alreadyFollowed) {
      return {
        status: STATUS.NOT_FOUND,
        summary: t(
          'You are not following team {TEAM} ({TEAM_ID}). Followed team IDs: {TEAMS}.',
          chatId,
          {
            TEAM: choice.teamName,
            TEAM_ID: choice.teamId,
            TEAMS: followedTeamIds.join(', ') || '—',
          },
        ),
        ...choice,
        leagueTeam: undefined,
        changed: false,
        followedTeamIds,
      };
    }

    return {
      status: STATUS.OK,
      ...choice,
      changed: true,
      screenshotTeamIds,
      storedTeams,
    };
  }

  function buildSummary(chatId, inspected) {
    if (
      inspected.action === ACTION.ADD &&
      inspected.screenshotTeamIds.length > 0
    ) {
      return t(
        'This will remove your screenshot teams {TEAMS} and follow league team "{TEAM}" ({TEAM_ID}) from {LEAGUE}.',
        chatId,
        {
          TEAMS: inspected.screenshotTeamIds.join('/'),
          TEAM: inspected.teamName,
          TEAM_ID: inspected.teamId,
          LEAGUE: inspected.leagueName,
        },
      );
    }
    if (inspected.action === ACTION.REMOVE) {
      return t(
        'Stop following league team "{TEAM}" ({TEAM_ID}) from {LEAGUE}.',
        chatId,
        {
          TEAM: inspected.teamName,
          TEAM_ID: inspected.teamId,
          LEAGUE: inspected.leagueName,
        },
      );
    }

    return t(
      'Follow league team "{TEAM}" ({TEAM_ID}) from {LEAGUE}.',
      chatId,
      {
        TEAM: inspected.teamName,
        TEAM_ID: inspected.teamId,
        LEAGUE: inspected.leagueName,
      },
    );
  }

  async function mutate(args) {
    return await runMutation(args.chatId, async () => {
      const inspected = await inspect(args);
      if (inspected.status !== STATUS.OK || !inspected.changed) {
        return inspected;
      }
      if (
        args.action === ACTION.ADD &&
        Array.isArray(args.expectedScreenshotTeamIds) &&
        [...args.expectedScreenshotTeamIds].sort().join('\0') !==
          [...inspected.screenshotTeamIds].sort().join('\0')
      ) {
        return {
          status: STATUS.INVALID_INPUT,
          summary: t(
            'Your screenshot teams changed after this action was proposed. No teams were changed; request follow_team again to review the current wipe warning.',
            args.chatId,
          ),
          changed: false,
          screenshotTeamIds: inspected.screenshotTeamIds,
        };
      }
      inspected.action = args.action;
      const snapshot = captureState(args.chatId);

      try {
        if (args.action === ACTION.ADD) {
          await ports.sourceSwitcher(args.chatId);
          const teamData = ports.mapLeagueTeamToBotTeam(
            inspected.leagueTeam,
          );
          await ports.storage.saveUserTeam(
            args.chatId,
            inspected.teamId,
            teamData,
          );
          await clearPreferences({
            chatId: args.chatId,
            teamId: inspected.teamId,
          });
          if (!currentTeamCache[args.chatId]) {
            currentTeamCache[args.chatId] = {};
          }
          currentTeamCache[args.chatId][inspected.teamId] = teamData;
          if (bestTeamsCache[args.chatId]) {
            delete bestTeamsCache[args.chatId][inspected.teamId];
          }
          await Promise.resolve(
            logger(
              `User ${args.chatId} started following team ${inspected.teamId} from league ${inspected.leagueCode}.`,
            ),
          ).catch(() => {});

          return {
            status: STATUS.OK,
            summary: t(
              'Now following team {TEAM} ({TEAM_ID}) from league {LEAGUE}.',
              args.chatId,
              {
                TEAM: inspected.teamName,
                TEAM_ID: inspected.teamId,
                LEAGUE: inspected.leagueName,
              },
            ),
            teamId: inspected.teamId,
            teamName: inspected.teamName,
            leagueCode: inspected.leagueCode,
            leagueName: inspected.leagueName,
            changed: true,
            clearedScreenshotTeamIds: inspected.screenshotTeamIds,
          };
        }

        const leagueTeamIds = Object.keys(inspected.storedTeams)
          .filter(isLeagueTeamId)
          .filter((id) => id !== inspected.teamId);
        const selectedTeam = getSelectedTeam(args.chatId);
        const fallbackSelectedTeam =
          args.mutateSelectedTeam !== false &&
          selectedTeam === inspected.teamId
            ? leagueTeamIds[0] || null
            : selectedTeam;
        await ports.storage.deleteUserTeam(
          args.chatId,
          inspected.teamId,
        );
        await clearPreferences({
          chatId: args.chatId,
          teamId: inspected.teamId,
          attributes: args.mutateSelectedTeam === false
            ? {}
            : { selectedTeam: fallbackSelectedTeam },
        });
        if (currentTeamCache[args.chatId]) {
          delete currentTeamCache[args.chatId][inspected.teamId];
          if (Object.keys(currentTeamCache[args.chatId]).length === 0) {
            delete currentTeamCache[args.chatId];
          }
        }
        if (bestTeamsCache[args.chatId]) {
          delete bestTeamsCache[args.chatId][inspected.teamId];
          if (Object.keys(bestTeamsCache[args.chatId]).length === 0) {
            delete bestTeamsCache[args.chatId];
          }
        }
        if (
          args.mutateSelectedTeam !== false &&
          selectedTeam === inspected.teamId
        ) {
          setCachedSelectedTeam(args.chatId, fallbackSelectedTeam);
        }
        await Promise.resolve(
          logger(
            `User ${args.chatId} stopped following team ${inspected.teamId}. Active team: ${fallbackSelectedTeam || 'none'}.`,
          ),
        ).catch(() => {});

        return {
          status: STATUS.OK,
          summary: t(
            'Stopped following team {TEAM} ({TEAM_ID}).',
            args.chatId,
            {
              TEAM: inspected.teamName,
              TEAM_ID: inspected.teamId,
            },
          ),
          teamId: inspected.teamId,
          teamName: inspected.teamName,
          leagueCode: inspected.leagueCode,
          leagueName: inspected.leagueName,
          changed: true,
          removed: true,
          fallbackSelectedTeam,
        };
      } catch (err) {
        try {
          await restoreState(args.chatId, snapshot);
        } catch (restoreErr) {
          console.error(
            `Failed to restore team state for ${args.chatId}:`,
            restoreErr,
          );
        }
        throw err;
      }
    });
  }

  return { inspect, mutate, buildSummary };
}

module.exports = {
  ACTION,
  STATUS,
  createFollowTeamService,
};
