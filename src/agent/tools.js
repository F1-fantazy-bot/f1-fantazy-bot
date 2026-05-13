// CopilotKit v2 tool catalogue for the agent.
//
// Each tool uses `defineTool` from `@copilotkit/runtime/v2`:
//   { name, description, parameters: zodSchema, execute: (args) => any }
//
// The `parameters` field accepts any Standard Schema V1 library (Zod,
// Valibot, ArkType…). We use Zod because it's already a transitive dep
// via @copilotkit/runtime.
//
// `execute` calls into pure cores in `src/cores/*` — handlers must NOT
// import anything Telegram-specific.

const { defineTool } = require('@copilotkit/runtime/v2');
const z = require('zod');
const { getNextRaces } = require('../cores/nextRacesCore');

const tools = [
  defineTool({
    name: 'get_next_races',
    description:
      'Get the list of upcoming F1 races for the current season. Returns the season, an array of race objects (each with round, raceName, date/time, Circuit.circuitName, Circuit.Location.locality, Circuit.Location.country, and per-session schedules), and counts {total, sprint}. Use this for any question about upcoming races, race dates, locations, or country filtering — apply filters and sorting yourself on the returned array.',
    parameters: z.object({}),
    execute: async () => {
      return getNextRaces();
    },
  }),
];

module.exports = { tools };

