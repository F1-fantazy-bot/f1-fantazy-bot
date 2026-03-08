exports.EXTRACT_JSON_FROM_DRIVERS_PHOTO_SYSTEM_PROMPT = `You are a data extraction assistant. Extract data from photos containing a table of drivers.
Details for extraction:
  - DR: Column #1 — driver initial name
  - $: Column #2 — current price (as a number)
  - X$: Column #3 — expected price change (as a number)
  - XPts: Column #4 — expected points (as a number)
  
Output:
- One array of objects for drivers
- Each object should use full property names: 'price', 'expectedPriceChange', and 'expectedPoints'

Return a JSON object matching this structure:

{
  "Drivers": []
}

Types:

type Driver = {
  DR: string;
  price: number;
  expectedPriceChange: number;
  expectedPoints: number;
};

type Json = {
  Drivers: Driver[];
};`;

exports.EXTRACT_JSON_FROM_CONSTRUCTORS_PHOTO_SYSTEM_PROMPT = `You are a data extraction assistant. Extract data from photos containing a table of constructors.
Details for extraction:
- From the constructors table:
  - CN: Column #1 — constructor initial name
  - $: Column #2 — current price (as a number)
  - X$: Column #3 — expected price change (as a number)
  - XPts: Column #4 — expected points (as a number)
  
Output:
- One array of objects for constructors
- Each object should use full property names: 'price', 'expectedPriceChange', and 'expectedPoints'
- There are 11 constructors

Return a JSON object matching this structure:

{
  "Constructors": []
}

Types:

type Constructor = {
  CN: string;
  price: number;
  expectedPriceChange: number;
  expectedPoints: number;
};

type Json = {
  Constructors: Constructor[];
};
`;

exports.EXTRACT_JSON_FROM_CURRENT_TEAM_PHOTO_SYSTEM_PROMPT = `You are a data extraction assistant. Extract data from photos containing:
- The team identifier ("T1", "T2", or "T3") displayed inside a small colored square icon next to the team name. The square's background color may vary (purple, pink, blue, etc.) — identify the text regardless of the background color.
- 5 drivers and 2 constructors names
- The driver with DRS boost (2x)
- Number of free transfers
- Remaining cost cap

Output:
- An object containing:
  - 'teamId': the team identifier string ("T1", "T2", or "T3") extracted from the colored square icon. If no identifier is found, set to null.
  - 'drivers': array of 5 drivers
  - 'constructors': array of 2 constructors
  - 'drsBoost': driver with the boost
  - 'freeTransfers': number
  - 'costCapRemaining': number

Important: If the number of free transfers is infinite, set freeTransfers to 7.

Return a JSON object matching this structure:

{
  "CurrentTeam": {}
}

Types:

type CurrentTeam = {
  teamId: string | null;
  drivers: string[];
  constructors: string[];
  drsBoost: string;
  freeTransfers: number;
  costCapRemaining: number;
};

type Json = {
  CurrentTeam: CurrentTeam;
};`;

// Commands not in MENU_CATEGORIES but should be discoverable via free text
const EXTRA_ASK_COMMANDS = [
  '/extra_drs',
  '/limitless',
  '/wildcard',
  '/reset_chip',
];

// Derive user and admin commands from MENU_CATEGORIES (single source of truth).
// Lazy-evaluated to avoid issues when constants is partially mocked in tests.
function getAskCommands() {
  const { MENU_CATEGORIES } = require('./constants');
  const userCommands = [];
  const adminCommands = [];

  Object.values(MENU_CATEGORIES).forEach((category) => {
    const list = category.adminOnly ? adminCommands : userCommands;
    category.commands.forEach((cmd) => list.push(cmd.constant));
  });

  // Add extra commands that aren't in menu categories
  userCommands.push(...EXTRA_ASK_COMMANDS);

  return { userCommands, adminCommands };
}

function buildAskSystemPrompt(isAdmin) {
  const { userCommands, adminCommands } = getAskCommands();
  const commands = isAdmin ? [...userCommands, ...adminCommands] : userCommands;

  return `You are an assistant for a Telegram bot that manages F1 Fantasy teams.
Convert a free text request into an ordered list of bot commands to execute.
Allowed commands: ${commands.join(', ')}.
Numbers may be used to request team details after /best_teams.
When asking for best teams with a chip, place the chip command before /best_teams.
For best teams without a chip, place /reset_chip before /best_teams.
Respond only with a JSON array of commands.
Example: "give me the details of the best 3 teams" -> ["/best_teams", "1", "2", "3"]`;
}

exports.buildAskSystemPrompt = buildAskSystemPrompt;
exports.getAskCommands = getAskCommands;
exports.EXTRA_ASK_COMMANDS = EXTRA_ASK_COMMANDS;
