const { getSystemPrompt } = require('./systemPrompt');

test('requires select_team after the user answers with a team name', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'A short reply containing a team name or teamId after that question',
  );
  expect(prompt).toContain(
    'call select_team with its canonical teamId IN THAT TURN',
  );
  expect(prompt).toContain(
    'call select_team DIRECTLY with that exact teamName',
  );
  expect(prompt).toContain(
    'Do NOT call list_user_teams merely to resolve a named team selection',
  );
  expect(prompt).toMatch(
    /NEVER\s+merely describe the approval\s+process/,
  );
  expect(prompt).toContain(
    'unless select_team actually returned status="confirmation_required"',
  );
  expect(prompt).toContain(
    'when an active-team switch request did not name a team',
  );
});

test('routes best-team ranking reads and writes to the right tools', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'report its budgetChangePointsPerMillion; do NOT call the write tool',
  );
  expect(prompt).toContain(
    'Points Plus Budget / 1.65 -> points_plus_budget',
  );
  expect(prompt).toMatch(
    /call\s+set_best_team_ranking in that turn/,
  );
});
