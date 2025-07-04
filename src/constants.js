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
exports.MENU_CALLBACK_TYPE = 'MENU';

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
exports.COMMAND_BILLING_STATS = '/billing_stats';
exports.COMMAND_MENU = '/menu';

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
        constant: exports.COMMAND_GET_CURRENT_SIMULATION,
        title: '📈 Current Simulation',
        description: 'Show the current simulation data and name',
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
    ],
  },
  ADMIN_COMMANDS: {
    id: 'admin_commands',
    title: '👤 Admin Commands',
    description: 'Administrative tools and functions',
    adminOnly: true,
    commands: [
      {
        constant: exports.COMMAND_LOAD_SIMULATION,
        title: '📋 Load Simulation',
        description: 'Load latest simulation data',
      },
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

// Menu callback actions
exports.MENU_ACTIONS = {
  MAIN_MENU: 'main_menu',
  CATEGORY: 'category',
  COMMAND: 'command',
  HELP: 'help',
};
