exports.KILZI_CHAT_ID = 454873194;
exports.DORSE_CHAT_ID = 673447790;
exports.LOG_CHANNEL_ID = -1002298860617;

exports.DRIVERS_PHOTO_TYPE = 'DRIVERS';
exports.CONSTRUCTORS_PHOTO_TYPE = 'CONSTRUCTORS';
exports.CURRENT_TEAM_PHOTO_TYPE = 'CURRENT_TEAM';

exports.EXTRA_DRS_CHIP = 'EXTRA_DRS';
exports.WILDCARD_CHIP = 'WILDCARD';
exports.LIMITLESS_CHIP = 'LIMITLESS';
exports.WITHOUT_CHIP = 'WITHOUT_CHIP';

exports.PHOTO_CALLBACK_TYPE = 'PHOTO';
exports.CHIP_CALLBACK_TYPE = 'CHIP';

exports.COMMAND_BEST_TEAMS = '/best_teams';
exports.COMMAND_CURRENT_TEAM_INFO = '/current_team_info';
exports.COMMAND_CHIPS = '/chips';
exports.COMMAND_PRINT_CACHE = '/print_cache';
exports.COMMAND_RESET_CACHE = '/reset_cache';
exports.COMMAND_HELP = '/help';
exports.COMMAND_TRIGGER_SCRAPING = '/trigger_scraping';
exports.COMMAND_LOAD_SIMULATION = '/load_simulation';
exports.COMMAND_GET_CURRENT_SIMULATION = '/get_current_simulation';
exports.COMMAND_GET_BOTFATHER_COMMANDS = '/get_botfather_commands';
exports.COMMAND_NEXT_RACE_INFO = '/next_race_info';

exports.USER_COMMANDS_CONFIG = [
  {
    constant: exports.COMMAND_HELP,
    description: 'Show this help message.',
  },
  {
    constant: exports.COMMAND_BEST_TEAMS,
    description:
      'Calculate and display the best possible teams based on your cached data.',
  },
  {
    constant: exports.COMMAND_CURRENT_TEAM_INFO,
    description: 'Calculate the current team info based on your cached data.',
  },
  {
    constant: exports.COMMAND_CHIPS,
    description: 'choose a chip to use for the current race.',
  },
  {
    constant: exports.COMMAND_PRINT_CACHE,
    description:
      'Show the currently cached drivers, constructors, and current team.',
  },
  {
    constant: exports.COMMAND_RESET_CACHE,
    description: 'Clear all cached data for this chat.',
  },
  {
    constant: exports.COMMAND_GET_CURRENT_SIMULATION,
    description: 'Show the current simulation data and name.',
  },
  {
    constant: exports.COMMAND_NEXT_RACE_INFO,
    description: 'Get detailed information about the next F1 race.',
  },
];

exports.ADMIN_COMMANDS_CONFIG = [
  {
    constant: exports.COMMAND_TRIGGER_SCRAPING,
    description: 'Trigger web scraping for latest F1 Fantasy data.',
  },
  {
    constant: exports.COMMAND_LOAD_SIMULATION,
    description: 'load latest simulation.',
  },
  {
    constant: exports.COMMAND_GET_BOTFATHER_COMMANDS,
    description: 'Get commands for BotFather.',
  },
];

exports.NAME_TO_CODE_DRIVERS_MAPPING = {
  'o. piastri': 'PIA',
  'l. norris': 'NOR',
  'g. russell': 'RUS',
  'm. verstappen': 'VER',
  'c. leclerc': 'LEC',
  'l. hamilton': 'HAM',
  'f. alonso': 'ALO',
  'c. sainz': 'SAI',
  'y. tsunoda': 'TSU',
  'a. albon': 'ALB',
  'l. stroll': 'STR',
  'n. hulkenberg': 'HUL',
  'o. bearman': 'BEA',
  'i. hadjar': 'HAD',
  'e. ocon': 'OCO',
  'p. gasly': 'GAS',
  'l. lawson': 'LAW',
  'j. doohan': 'DOO',
  'g. bortoleto': 'BOR',
  'g. bortoletto': 'BOR',
  'k. antonelli': 'ANT',
  'f. colapinto': 'COL',
};

exports.NAME_TO_CODE_CONSTRUCTORS_MAPPING = {
  mclaren: 'MCL',
  mercedes: 'MER',
  ferrari: 'FER',
  'red bull racing': 'RED',
  williams: 'WIL',
  'racing bulls': 'VRB',
  alpine: 'ALP',
  haas: 'HAA',
  'aston martin': 'AST',
  'kick sauber': 'KCK',
};

exports.NAME_TO_CODE_MAPPING = {
  ...exports.NAME_TO_CODE_DRIVERS_MAPPING,
  ...exports.NAME_TO_CODE_CONSTRUCTORS_MAPPING,
};
