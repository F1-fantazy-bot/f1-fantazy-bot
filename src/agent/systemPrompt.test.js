const { getSystemPrompt } = require('./systemPrompt');

test('requires select_team after the user answers with a team name', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'A short reply containing a team name or teamId after that question',
  );
  expect(prompt).toContain(
    'call select_team with the canonical teamId IN THAT TURN',
  );
  expect(prompt).toMatch(
    /NEVER\s+merely describe the approval\s+process/,
  );
  expect(prompt).toContain(
    'unless select_team actually returned status="confirmation_required"',
  );
  expect(prompt).toContain(
    'when an active-team switch request needs a team choice or name',
  );
});
