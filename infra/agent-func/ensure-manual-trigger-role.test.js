const fs = require('fs');
const path = require('path');
const { MANUAL_TRIGGERS } = require('../../src/manualTriggerService');

const script = fs.readFileSync(
  path.join(__dirname, 'ensure-manual-trigger-role.sh'),
  'utf8',
);

test('grants only the workflows exposed by the manual trigger registry', () => {
  const workflowNames = Object.values(MANUAL_TRIGGERS).map(
    ({ workflowName }) => workflowName,
  );

  expect(workflowNames).toHaveLength(5);
  for (const workflowName of workflowNames) {
    expect(script).toContain(`"${workflowName}"`);
  }
  expect(script).toContain('--role "$ROLE_NAME"');
  expect(script).toContain(
    '/providers/Microsoft.Logic/workflows/${workflow}',
  );
  expect(script).not.toContain('--scope "/subscriptions/${SUB}"');
  expect(script).not.toContain('--scope "/subscriptions/${SUB}/resourceGroups/${RG}"');
});
