exports.KILZI_CHAT_ID = 454873194;
exports.DORSE_CHAT_ID = 673447790;
exports.YEHONATAN_CHAT_ID = 740312192;
exports.HAIM_CHAT_ID = 488951260;
exports.RONGO_CHAT_ID = 393514146;
exports.TOM_CHAT_ID = 94086234;
exports.OMER_BAREL_CHAT_ID = 417371432;
exports.OMER_BENBENISTY_CHAT_ID = 1389508932;
exports.ITIEL_CHAT_ID = 1378596429;
exports.IDO_KLOTZ_CHAT_ID = 1173171383;
exports.RAVIV_MAROM_CHAT_ID = 8516276539;

exports.LOG_CHANNEL_ID = -1002298860617;
exports.ERRORS_CHANNEL_ID = -5167373779;
exports.REPORTED_BUGS_GROUP_ID = -5161566735;

exports.DRIVERS_PHOTO_TYPE = 'DRIVERS';
exports.CONSTRUCTORS_PHOTO_TYPE = 'CONSTRUCTORS';
exports.CURRENT_TEAM_PHOTO_TYPE = 'CURRENT_TEAM';

exports.EXTRA_BOOST_CHIP = 'EXTRA_BOOST';
exports.WILDCARD_CHIP = 'WILDCARD';
exports.LIMITLESS_CHIP = 'LIMITLESS';
exports.WITHOUT_CHIP = 'WITHOUT_CHIP';

exports.PHOTO_CALLBACK_TYPE = 'PHOTO';
exports.CHIP_CALLBACK_TYPE = 'CHIP';
exports.MENU_CALLBACK_TYPE = 'MENU';
exports.LANG_CALLBACK_TYPE = 'LANG';
exports.TEAM_CALLBACK_TYPE = 'TEAM';
exports.TEAM_ASSIGN_CALLBACK_TYPE = 'TEAM_ASSIGN';
exports.BEST_TEAM_WEIGHTS_CALLBACK_TYPE = 'BEST_TEAM_WEIGHTS';
exports.DEADLINE_CALLBACK_TYPE = 'DEADLINE';
exports.LEAGUE_CALLBACK_TYPE = 'LEAGUE';
exports.LEAGUE_UNFOLLOW_CALLBACK_TYPE = 'LEAGUE_UNFOLLOW';

exports.MAX_TELEGRAM_MESSAGE_LENGTH = 4096;
exports.BEST_TEAMS_RESULT_COUNT = 15;

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
exports.COMMAND_NEXT_RACES = '/next_races';
exports.COMMAND_NEXT_RACE_WEATHER = '/next_race_weather';
exports.COMMAND_BILLING_STATS = '/billing_stats';
exports.COMMAND_VERSION = '/version';
exports.COMMAND_MENU = '/menu';
exports.COMMAND_SET_LANGUAGE = '/lang';
exports.COMMAND_EXTRA_BOOST = '/extra_boost';
exports.COMMAND_LIMITLESS = '/limitless';
exports.COMMAND_WILDCARD = '/wildcard';
exports.COMMAND_RESET_CHIP = '/reset_chip';
exports.COMMAND_FLOW = '/flow';
exports.COMMAND_START = '/start';
exports.COMMAND_REPORT_BUG = '/report_bug';
exports.COMMAND_LIST_USERS = '/list_users';
exports.COMMAND_SEND_MESSAGE_TO_USER = '/send_message_to_user';
exports.COMMAND_BROADCAST = '/broadcast';
exports.COMMAND_SET_NICKNAME = '/set_nickname';
exports.COMMAND_LIVE_SCORE = '/live_score';
exports.COMMAND_UPLOAD_DRIVERS_PHOTO = '/upload_drivers_photo';
exports.COMMAND_UPLOAD_CONSTRUCTORS_PHOTO = '/upload_constructors_photo';
exports.COMMAND_SELECT_TEAM = '/select_team';
exports.COMMAND_SET_BEST_TEAM_RANKING = '/set_best_team_ranking';
exports.COMMAND_BEST_TEAM_SCENARIOS = '/best_team_scenarios';
exports.COMMAND_DEADLINE = '/deadline';
exports.COMMAND_FOLLOW_LEAGUE = '/follow_league';
exports.COMMAND_UNFOLLOW_LEAGUE = '/unfollow_league';
exports.COMMAND_LEADERBOARD = '/leaderboard';

// Menu configuration for interactive menu command
exports.MENU_CATEGORIES = {
  HELP_MENU: {
    id: 'help_menu',
    title: '❓ Help & Menu',
    description: 'Help and navigation commands',
    hideFromMenu: true, // Don't show in interactive menu
    commands: [
      {
        constant: exports.COMMAND_HELP,
        title: '❓ Help',
        description: 'Show this help message.',
      },
      {
        constant: exports.COMMAND_MENU,
        title: '📱 Menu',
        description: 'Show interactive menu with all available commands.',
      },
      {
        constant: exports.COMMAND_FLOW,
        title: '🏁 Usage Flow',
        description: 'Explains the usage flow of the bot step by step.',
      },
      {
        constant: exports.COMMAND_REPORT_BUG,
        title: '🐛 Report Bug',
        description: 'Report a bug or send feedback to the admins',
      },
    ],
  },
  TEAM_MANAGEMENT: {
    id: 'team_management',
    title: '🏎️ Team Management',
    description: 'Manage and optimize your F1 Fantasy team',
    commands: [
      {
        constant: exports.COMMAND_BEST_TEAMS,
        title: '🏆 Best Teams',
        description:
          'Calculate and display the best possible teams based on your cached data',
      },
      {
        constant: exports.COMMAND_CURRENT_TEAM_INFO,
        title: '👥 Current Team Info',
        description:
          'Calculate the current team info based on your cached data',
      },
      {
        constant: exports.COMMAND_CHIPS,
        title: '🎯 Chips Selection',
        description: 'Choose a chip to use for the current race',
      },
      {
        constant: exports.COMMAND_SELECT_TEAM,
        title: '🔀 Select Team',
        description: 'Switch between your fantasy teams',
      },
      {
        constant: exports.COMMAND_SET_BEST_TEAM_RANKING,
        title: '⚖️ Set Best Team Ranking',
        description:
          'Set how budget changes affect best-team ranking suggestions',
      },
      {
        constant: exports.COMMAND_BEST_TEAM_SCENARIOS,
        title: '🧪 Best Team Scenarios',
        description:
          'Compare the top best-team outcome across ranking and chip scenarios',
      },
    ],
  },
  ANALYSIS_STATS: {
    id: 'analysis_stats',
    title: '📊 Analysis & Stats',
    description: 'View race information and performance data',
    commands: [
      {
        constant: exports.COMMAND_NEXT_RACE_INFO,
        title: '🏁 Next Race Info',
        description: 'Get detailed information about the next F1 race',
      },
      {
        constant: exports.COMMAND_NEXT_RACES,
        title: '🗓️ Upcoming Races',
        description:
          'View schedule details for the remaining races this season',
      },
      {
        constant: exports.COMMAND_NEXT_RACE_WEATHER,
        title: '🌦️ Next Race Weather',
        description: 'Get detailed weather forecast for the next race',
      },
      {
        constant: exports.COMMAND_DEADLINE,
        title: '⏳ Deadline',
        description: 'Show time left until your next fantasy team lock deadline',
      },
      {
        constant: exports.COMMAND_GET_CURRENT_SIMULATION,
        title: '📈 Current Simulation',
        description: 'Show the current simulation data and name',
      },
      {
        constant: exports.COMMAND_LIVE_SCORE,
        title: '🔴 Live Score',
        description: 'Show current live points and price change for your team',
      },
    ],
  },
  UTILITIES: {
    id: 'utilities',
    title: '🔧 Utilities',
    description: 'Data management and maintenance tools',
    commands: [
      {
        constant: exports.COMMAND_PRINT_CACHE,
        title: '📄 Print Cache',
        description:
          'Show the currently cached drivers, constructors, and current team',
      },
      {
        constant: exports.COMMAND_RESET_CACHE,
        title: '🗑️ Reset Cache',
        description: 'Clear all cached data for this chat',
      },
      {
        constant: exports.COMMAND_SET_LANGUAGE,
        title: '🌐 Set Language',
        description: 'Change bot language for this session',
      },
      {
        constant: exports.COMMAND_LOAD_SIMULATION,
        title: '📋 Load Simulation',
        description: 'Load latest simulation data',
      },
    ],
  },
  ADMIN_COMMANDS: {
    id: 'admin_commands',
    title: '👤 Admin Commands',
    description: 'Administrative tools and functions',
    adminOnly: true,
    commands: [
      {
        constant: exports.COMMAND_TRIGGER_SCRAPING,
        title: '🔄 Trigger Scraping',
        description: 'Trigger web scraping for latest F1 Fantasy data',
      },
      {
        constant: exports.COMMAND_GET_BOTFATHER_COMMANDS,
        title: '🤖 BotFather Commands',
        description: 'Get commands for BotFather setup',
      },
      {
        constant: exports.COMMAND_BILLING_STATS,
        title: '💰 Billing Stats',
        description: 'Get Azure billing statistics for the current month',
      },
      {
        constant: exports.COMMAND_VERSION,
        title: 'ℹ️ Version',
        description: 'Show current deployed version',
      },
      {
        constant: exports.COMMAND_LIST_USERS,
        title: '👥 List Users',
        description: 'List all registered bot users',
      },
      {
        constant: exports.COMMAND_SEND_MESSAGE_TO_USER,
        title: '✉️ Send Message to User',
        description: 'Send a message to a specific bot user',
      },
      {
        constant: exports.COMMAND_BROADCAST,
        title: '📢 Broadcast',
        description: 'Send a message to all bot users',
      },
      {
        constant: exports.COMMAND_SET_NICKNAME,
        title: '📛 Set Nickname',
        description: 'Set a nickname for a user to display in logs',
      },
      {
        constant: exports.COMMAND_UPLOAD_DRIVERS_PHOTO,
        title: '📤 Upload Drivers Photo',
        description: 'Upload a drivers screenshot for cache extraction',
      },
      {
        constant: exports.COMMAND_UPLOAD_CONSTRUCTORS_PHOTO,
        title: '📤 Upload Constructors Photo',
        description: 'Upload a constructors screenshot for cache extraction',
      },
    ],
  },
  LEAGUE_MANAGEMENT: {
    id: 'league_management',
    title: '🏁 League Management',
    description: 'Follow and view F1 Fantasy leagues',
    adminOnly: true,
    commands: [
      {
        constant: exports.COMMAND_FOLLOW_LEAGUE,
        title: '➕ Follow League',
        description: 'Follow an F1 Fantasy league by its code',
      },
      {
        constant: exports.COMMAND_UNFOLLOW_LEAGUE,
        title: '➖ Unfollow League',
        description: 'Unfollow an F1 Fantasy league',
      },
      {
        constant: exports.COMMAND_LEADERBOARD,
        title: '🏆 Leaderboard',
        description: 'View the leaderboard of a followed league',
      },
    ],
  },
};

// Generate USER_COMMANDS_CONFIG from MENU_CATEGORIES
function generateUserCommandsConfig() {
  const commands = [];

  // Add all non-admin commands from menu categories (including help/menu)
  Object.values(exports.MENU_CATEGORIES).forEach((category) => {
    if (!category.adminOnly) {
      category.commands.forEach((command) => {
        commands.push({
          constant: command.constant,
          description: command.description,
        });
      });
    }
  });

  return commands;
}

// Generate ADMIN_COMMANDS_CONFIG from MENU_CATEGORIES
function generateAdminCommandsConfig() {
  const commands = [];

  // Add all admin commands from menu categories
  Object.values(exports.MENU_CATEGORIES).forEach((category) => {
    if (category.adminOnly) {
      category.commands.forEach((command) => {
        commands.push({
          constant: command.constant,
          description: command.description,
        });
      });
    }
  });

  return commands;
}

exports.USER_COMMANDS_CONFIG = generateUserCommandsConfig();
exports.ADMIN_COMMANDS_CONFIG = generateAdminCommandsConfig();

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
  'a. lindblad': 'LIN',
  'j. doohan': 'DOO',
  'g. bortoleto': 'BOR',
  'g. bortoletto': 'BOR',
  'k. antonelli': 'ANT',
  'f. colapinto': 'COL',
  's. perez': 'PER',
  perez: 'PER',
  'v. bottas': 'BOT',
  bottas: 'BOT',
};

// important note - all keys in NAME_TO_CODE_MAPPING must be in lowercase, and all values must be uppercase, as this is how they are used in the code (lowercase for matching user input, uppercase for generating the final team code)
exports.NAME_TO_CODE_CONSTRUCTORS_MAPPING = {
  mclaren: 'MCL',
  mercedes: 'MER',
  ferrari: 'FER',
  'red bull racing': 'RED',
  williams: 'WIL',
  'racing bulls': 'VRB',
  alpine: 'ALP',
  'haas f1 team': 'HAA',
  'aston martin': 'AST',
  'kick sauber': 'KCK',
  cadillac: 'CAD',
  audi: 'AUD',
};

exports.NAME_TO_CODE_MAPPING = {
  ...exports.NAME_TO_CODE_DRIVERS_MAPPING,
  ...exports.NAME_TO_CODE_CONSTRUCTORS_MAPPING,
};

// Menu callback actions
exports.MENU_ACTIONS = {
  MAIN_MENU: 'main_menu',
  CATEGORY: 'category',
  COMMAND: 'command',
  HELP: 'help',
};
