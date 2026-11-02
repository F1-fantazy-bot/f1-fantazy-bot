const z = require('zod');
// Nullable targets give strict tool providers a real representation of an
// omitted argument, instead of forcing the model to invent a string value.
const target = (description) => z.string().trim().max(200).nullish().describe(description);
const parameters = z.object({
  scope: z.enum(['team', 'tracked', 'league']).nullish().describe(
    'Use null or omit for a generic remaining-chips question: the tool opens scope choices. Use tracked ONLY when the user explicitly requests all tracked teams; team for one team; league for an entire league. Never infer tracked or the selected team for a generic question.',
  ),
  teamId: target('Canonical team ID explicitly supplied by the user or a prior selection. Otherwise null or omitted. Never invent IDs or use placeholder strings.'),
  teamName: target('Team name explicitly named by the user. Otherwise null or omitted. Never use the selected team implicitly or a placeholder string.'),
  leagueCode: target('Canonical followed-league code explicitly supplied by the user or a prior selection. Otherwise null or omitted. Never invent codes or use placeholder strings.'),
  leagueName: target('League name explicitly named by the user. Otherwise null or omitted. Never invent a name or use placeholder strings.'),
}).strict();

function parseAvailableChipsCommand(command) {
  const match = typeof command === 'string' && command.match(/^\/available_chips(?:@[a-z0-9_]+)?(?:\s+([\s\S]+))?$/i);
  if (!match) {throw new Error('Invalid command');}

  return parameters.parse(match[1] ? JSON.parse(match[1]) : {});
}
module.exports = { parameters, parseAvailableChipsCommand };
