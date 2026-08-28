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
  expect(prompt).toContain(
    'Call set_best_team_ranking only when the user explicitly asks',
  );
});

test('routes chip reads, activation, and reset correctly', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'Call get_current_team for the requested team and report its chip',
  );
  expect(prompt).toContain(
    'no chip / reset /',
  );
  expect(prompt).toContain(
    'Call activate_chip only when the user explicitly asks',
  );
});

test('uses the selected team by default for singular team operations', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'use their currently selected team automatically',
  );
  expect(prompt).toMatch(
    /NEVER\s+ask "which team\?" merely because the user omitted a team/,
  );
  expect(prompt).toMatch(
    /omit teamId\/teamName so the tool applies the\s+change to the selected team automatically/,
  );
  expect(prompt).toMatch(
    /tool automatically uses the selected team/,
  );
  expect(prompt).not.toContain(
    'Requires a team\n  plus one presetId',
  );
  expect(prompt).not.toContain(
    'the user runs /set_best_team_ranking in\n  Telegram',
  );
});

test('routes follow-league reads and writes separately', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'call follow_league directly with leagueCode',
  );
  expect(prompt).toContain(
    'remain read-only list_user_leagues requests',
  );
  expect(prompt).toContain(
    'a valid but untracked code should',
  );
  expect(prompt).toContain('/report_bug; that is a Telegram-only command');
});

test('routes unfollow league through its confirmed write tool', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'call\n  unfollow_league with its exact leagueCode or leagueName',
  );
  expect(prompt).toContain(
    'Read-only questions\n  about followed leagues still use list_user_leagues',
  );
});
