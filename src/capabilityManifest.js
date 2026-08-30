const constants = require('./constants');

const AUDIENCE = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

const AGENT_STATUS = Object.freeze({
  IMPLEMENTED: 'implemented',
  ADAPTED: 'adapted',
  PLANNED: 'planned',
  EXCLUDED: 'excluded',
});

const CONFIRMATION = Object.freeze({
  NONE: 'none',
  REQUIRED: 'required',
  GUIDED: 'guided',
});

function capability({
  command,
  audience,
  status,
  tools,
  confirmation = CONFIRMATION.NONE,
  rationale = '',
}) {
  return Object.freeze({
    command,
    audience,
    telegram: Object.freeze({ implemented: true }),
    agent: Object.freeze({
      status,
      tools: Object.freeze([...tools]),
      confirmation,
      rationale,
    }),
  });
}

const user = (command, status, tools, options) =>
  capability({
    command,
    audience: AUDIENCE.USER,
    status,
    tools,
    ...options,
  });
const admin = (command, status, tools, options) =>
  capability({
    command,
    audience: AUDIENCE.ADMIN,
    status,
    tools,
    ...options,
  });

const COMMAND_CAPABILITIES = Object.freeze([
  user(constants.COMMAND_BEST_TEAMS, AGENT_STATUS.IMPLEMENTED, [
    'get_best_teams',
  ]),
  user(constants.COMMAND_BEST_TEAM_SCENARIOS, AGENT_STATUS.IMPLEMENTED, [
    'get_best_team_scenarios',
  ]),
  user(constants.COMMAND_CURRENT_TEAM_INFO, AGENT_STATUS.IMPLEMENTED, [
    'get_current_team',
  ]),
  user(constants.COMMAND_CHIPS, AGENT_STATUS.IMPLEMENTED, ['activate_chip'], {
    confirmation: CONFIRMATION.REQUIRED,
  }),
  user(constants.COMMAND_EXTRA_BOOST, AGENT_STATUS.IMPLEMENTED, [
    'activate_chip',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  user(constants.COMMAND_LIMITLESS, AGENT_STATUS.IMPLEMENTED, [
    'activate_chip',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  user(constants.COMMAND_WILDCARD, AGENT_STATUS.IMPLEMENTED, [
    'activate_chip',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  user(constants.COMMAND_RESET_CHIP, AGENT_STATUS.IMPLEMENTED, [
    'activate_chip',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  user(constants.COMMAND_SET_LANGUAGE, AGENT_STATUS.IMPLEMENTED, [
    'get_language',
    'set_language',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  user(constants.COMMAND_SELECT_TEAM, AGENT_STATUS.IMPLEMENTED, [
    'list_user_teams',
    'select_team',
  ], { confirmation: CONFIRMATION.GUIDED }),
  user(
    constants.COMMAND_SET_BEST_TEAM_RANKING,
    AGENT_STATUS.IMPLEMENTED,
    ['get_current_team', 'set_best_team_ranking'],
    { confirmation: CONFIRMATION.REQUIRED },
  ),
  user(constants.COMMAND_NEXT_RACE_INFO, AGENT_STATUS.IMPLEMENTED, [
    'get_next_race_info',
  ]),
  user(constants.COMMAND_NEXT_RACES, AGENT_STATUS.IMPLEMENTED, [
    'get_next_races',
  ]),
  user(constants.COMMAND_NEXT_RACE_WEATHER, AGENT_STATUS.IMPLEMENTED, [
    'get_race_weather',
  ]),
  user(constants.COMMAND_DEADLINE, AGENT_STATUS.IMPLEMENTED, [
    'get_deadline',
  ]),
  user(constants.COMMAND_LIVE_SCORE, AGENT_STATUS.IMPLEMENTED, [
    'list_user_leagues',
    'list_league_teams',
    'get_live_score_for_team',
    'get_live_score_leaderboard',
  ]),
  user(constants.COMMAND_FOLLOW_LEAGUE, AGENT_STATUS.IMPLEMENTED, [
    'follow_league',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  user(constants.COMMAND_UNFOLLOW_LEAGUE, AGENT_STATUS.IMPLEMENTED, [
    'list_user_leagues',
    'unfollow_league',
  ], { confirmation: CONFIRMATION.GUIDED }),
  user(constants.COMMAND_LEADERBOARD, AGENT_STATUS.IMPLEMENTED, [
    'list_user_leagues',
    'get_leaderboard',
  ]),
  user(constants.COMMAND_REPORT_BUG, AGENT_STATUS.IMPLEMENTED, [
    'report_bug',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  user(constants.COMMAND_TEAMS_TRACKER, AGENT_STATUS.ADAPTED, [
    'list_followed_teams',
    'list_user_leagues',
    'list_league_teams',
    'follow_team',
  ], {
    confirmation: CONFIRMATION.GUIDED,
    rationale:
      'The agent adds or removes one canonical team per confirmation; Telegram keeps its batch toggle and Save workflow.',
  }),

  user(constants.COMMAND_HELP, AGENT_STATUS.PLANNED, ['get_agent_guide']),
  user(constants.COMMAND_FLOW, AGENT_STATUS.PLANNED, ['get_agent_guide']),
  user(constants.COMMAND_LEAGUE_CHANGES, AGENT_STATUS.PLANNED, [
    'get_league_changes',
  ]),
  user(constants.COMMAND_LEAGUE_GRAPHS, AGENT_STATUS.PLANNED, [
    'get_league_graph',
  ]),
  user(constants.COMMAND_RACE_SUMMARY, AGENT_STATUS.PLANNED, [
    'get_race_summary',
  ]),
  user(constants.COMMAND_WHATS_NEW, AGENT_STATUS.PLANNED, [
    'get_whats_new',
  ]),
  user(constants.COMMAND_GET_CURRENT_SIMULATION, AGENT_STATUS.PLANNED, [
    'get_simulation_status',
  ]),
  user(constants.COMMAND_LOAD_SIMULATION, AGENT_STATUS.PLANNED, [
    'load_latest_simulation',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  user(constants.COMMAND_PRINT_CACHE, AGENT_STATUS.PLANNED, [
    'get_data_status',
  ]),
  user(constants.COMMAND_RESET_CACHE, AGENT_STATUS.PLANNED, [
    'reset_user_data',
  ], { confirmation: CONFIRMATION.REQUIRED }),

  user(constants.COMMAND_MENU, AGENT_STATUS.EXCLUDED, [], {
    rationale:
      'Telegram navigation construct; natural-language chat has no command menu.',
  }),
  user(constants.COMMAND_START, AGENT_STATUS.EXCLUDED, [], {
    rationale:
      'Telegram lifecycle entry point; web sign-in and the agent guide own onboarding.',
  }),

  admin(constants.COMMAND_VERSION, AGENT_STATUS.PLANNED, [
    'get_admin_version',
  ]),
  admin(constants.COMMAND_BILLING_STATS, AGENT_STATUS.PLANNED, [
    'get_billing_stats',
  ]),
  admin(constants.COMMAND_LIST_USERS, AGENT_STATUS.PLANNED, [
    'list_bot_users',
  ]),
  admin(constants.COMMAND_LIST_WEB_USERS, AGENT_STATUS.PLANNED, [
    'list_web_users',
  ]),
  admin(constants.COMMAND_GET_BOTFATHER_COMMANDS, AGENT_STATUS.PLANNED, [
    'get_botfather_setup',
  ]),
  admin(constants.COMMAND_SET_NICKNAME, AGENT_STATUS.PLANNED, [
    'set_user_nickname',
  ], { confirmation: CONFIRMATION.GUIDED }),
  admin(constants.COMMAND_ALLOW_WEB_USER, AGENT_STATUS.PLANNED, [
    'allow_web_user',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  admin(constants.COMMAND_REVOKE_WEB_USER, AGENT_STATUS.PLANNED, [
    'revoke_web_user',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  admin(constants.COMMAND_SEND_MESSAGE_TO_USER, AGENT_STATUS.PLANNED, [
    'send_user_message',
  ], { confirmation: CONFIRMATION.GUIDED }),
  admin(constants.COMMAND_BROADCAST, AGENT_STATUS.PLANNED, [
    'broadcast_message',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  admin(constants.COMMAND_TRIGGER_SCRAPING, AGENT_STATUS.PLANNED, [
    'trigger_scraping',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  admin(constants.COMMAND_TRIGGER_API_DATA, AGENT_STATUS.PLANNED, [
    'trigger_api_data',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  admin(constants.COMMAND_TRIGGER_API_DATA_LOCKED, AGENT_STATUS.PLANNED, [
    'trigger_api_data_locked',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  admin(constants.COMMAND_TRIGGER_NEXT_RACE_INFO, AGENT_STATUS.PLANNED, [
    'trigger_next_race_info',
  ], { confirmation: CONFIRMATION.REQUIRED }),
  admin(
    constants.COMMAND_TRIGGER_LIVE_SCORE_SCHEDULER,
    AGENT_STATUS.PLANNED,
    ['trigger_live_score_scheduler'],
    { confirmation: CONFIRMATION.REQUIRED },
  ),
  admin(constants.COMMAND_UPLOAD_DRIVERS_PHOTO, AGENT_STATUS.EXCLUDED, [], {
    rationale:
      'Projection image import remains Telegram-only; general browser file uploads are outside the agent scope.',
  }),
  admin(
    constants.COMMAND_UPLOAD_CONSTRUCTORS_PHOTO,
    AGENT_STATUS.EXCLUDED,
    [],
    {
      rationale:
        'Projection image import remains Telegram-only; general browser file uploads are outside the agent scope.',
    },
  ),
]);

const AGENT_NATIVE_SUPPORTING_TOOLS = Object.freeze(['confirm_write']);

function getCapabilityByCommand(command) {
  return (
    COMMAND_CAPABILITIES.find(
      (capabilityEntry) => capabilityEntry.command === command,
    ) || null
  );
}

function findUnwrappedAdminTools(
  capabilities,
  registeredAdminTools,
) {
  return capabilities
    .filter(
      (entry) =>
        entry.audience === AUDIENCE.ADMIN &&
        (entry.agent.status === AGENT_STATUS.IMPLEMENTED ||
          entry.agent.status === AGENT_STATUS.ADAPTED),
    )
    .flatMap((entry) => entry.agent.tools)
    .filter((toolName) => !registeredAdminTools.has(toolName));
}

module.exports = {
  AUDIENCE,
  AGENT_STATUS,
  CONFIRMATION,
  COMMAND_CAPABILITIES,
  AGENT_NATIVE_SUPPORTING_TOOLS,
  getCapabilityByCommand,
  findUnwrappedAdminTools,
};
