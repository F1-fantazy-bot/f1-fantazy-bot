jest.mock('@copilotkit/runtime/v2', () => ({
  defineTool: jest.fn((spec) => spec),
}));

const { tools } = require('../agent/tools');
const { getRegisteredAdminTools } = require('../agent/adminAuthorization');
const { AGENT_COMMANDS } = require('./agentCommandCatalog');

test('every user-facing registered agent tool has one card', () => {
  const internal = new Set(['get_action_choices', 'confirm_write', 'propose_workflow']);
  const expected = tools.map((tool) => tool.name).filter((name) => !internal.has(name));

  expect(AGENT_COMMANDS.map((command) => command.id).sort()).toEqual(expected.sort());
  for (const command of AGENT_COMMANDS) {
    expect(command.title.en).toBeTruthy();
    expect(command.title.he).toBeTruthy();
    expect(command.example.en).toBeTruthy();
    expect(command.example.he).toBeTruthy();
  }
});

test('all administrator tools appear only in the admin section', () => {
  const adminNames = new Set(getRegisteredAdminTools().keys());
  const catalogAdminNames = AGENT_COMMANDS.filter((command) => command.topic === 'admin')
    .map((command) => command.id);

  expect(catalogAdminNames.sort()).toEqual([...adminNames].sort());
});
