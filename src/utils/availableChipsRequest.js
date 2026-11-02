const z = require('zod');
const parameters = z.object({
  scope: z.enum(['team', 'tracked', 'league']).optional(),
  teamId: z.string().trim().min(1).max(200).optional(),
  teamName: z.string().trim().min(1).max(200).optional(),
  leagueCode: z.string().trim().min(1).max(200).optional(),
  leagueName: z.string().trim().min(1).max(200).optional(),
}).strict();

function parseAvailableChipsCommand(command) {
  const match = typeof command === 'string' && command.match(/^\/available_chips(?:@[a-z0-9_]+)?(?:\s+([\s\S]+))?$/i);
  if (!match) {throw new Error('Invalid command');}

  return parameters.parse(match[1] ? JSON.parse(match[1]) : {});
}
module.exports = { parameters, parseAvailableChipsCommand };
