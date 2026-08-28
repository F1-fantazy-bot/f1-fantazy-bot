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
  expect(prompt).toContain('Report missing league button');
  expect(prompt).toContain('do NOT ask them to retype the');
  expect(prompt).not.toContain('agent cannot submit');
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

test('requires an explicit team and league for follow_team', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'The selected/active team is irrelevant for follow_team',
  );
  expect(prompt).toContain('Always require an explicit target team');
  expect(prompt).toContain(
    'call list_user_leagues\n    immediately with selectionMode="follow_team"',
  );
  expect(prompt).toContain(
    'call list_league_teams with that\n    exact leagueCode and selectionMode="follow_team"',
  );
  expect(prompt).toMatch(
    /Do NOT ask the user to type\s+a league name or code/,
  );
  expect(prompt).toMatch(
    /Do NOT ask the user to\s+type a team name/,
  );
  expect(prompt).toContain('will wipe all screenshot teams');
});
test('routes explicit bug reports through the confirmed report_bug tool', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'call report_bug with that text exactly',
  );
  expect(prompt).toContain('Never invent report details');
  expect(prompt).toContain(
    'Never claim it was sent before',
  );
});
