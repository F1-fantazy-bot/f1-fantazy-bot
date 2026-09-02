const { getSystemPrompt } = require('./systemPrompt');

test('routes help and onboarding to the agent-native guide', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'When the user asks for help, how to get started, what the agent can do',
  );
  expect(prompt).toContain('call get_agent_guide');
  expect(prompt).toContain(
    "Do not reproduce Telegram's\n    slash-command menu",
  );
  expect(prompt).toContain(
    'The tool itself hides admin guidance from non-admins',
  );
});

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
    'selectionMode="unfollow_league"',
  );
  expect(prompt).toMatch(
    /Do NOT ask the user to type a league name\s+or code/,
  );
  expect(prompt).toContain(
    'still use list_user_leagues without selectionMode',
  );
});

test('routes league changes through canonical clickable league selection', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'get_league_changes — planning-to-locked roster changes',
  );
  expect(prompt).toContain('call\n    get_league_changes with no arguments');
  expect(prompt).toContain('Do NOT call list_user_leagues first');
  expect(prompt).toMatch(
    /do NOT ask the user to type a\s+league name or code/,
  );
  expect(prompt).toContain(
    'exact canonical leagueCode supplied by\n    the selection message',
  );
  expect(prompt).toContain(
    'missing_locked, missing_planning, and matchday_mismatch',
  );
});

test('routes league graphs through canonical league and type cards', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'get_league_graph — structured gap-to-leader, standings, or budget history',
  );
  expect(prompt).toContain('gap/distance/points behind the leader');
  expect(prompt).toContain('omit graphType so clickable');
  expect(prompt).toContain(
    'omit leagueCode so clickable followed-',
  );
  expect(prompt).toContain('Preserve graphType when the user already named');
  expect(prompt).toContain('Do NOT call list_user_leagues first');
  expect(prompt).toMatch(
    /do NOT ask the user to type a\s+league name, code, or graph type/,
  );
  expect(prompt).toContain(
    'exact canonical leagueCode and graphType supplied by the selection message',
  );
  expect(prompt).toContain('do not convert tied standings into unique ranks');
});

test('routes race summaries through canonical clickable league selection', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'get_race_summary — generated post-race recap',
  );
  expect(prompt).toContain('call get_race_summary with no arguments');
  expect(prompt).toContain('Do NOT call list_user_leagues first');
  expect(prompt).toMatch(/do NOT ask the user to type a\s+league name or code/);
  expect(prompt).toContain(
    'exact\n    canonical leagueCode supplied by the selection message',
  );
  expect(prompt).toContain("user's saved language");
  expect(prompt).toContain('Do not rewrite the');
  expect(prompt).toContain('missing_data, empty, and generation_error');
  expect(prompt).toContain('Treat only missing_data as absent race data');
  expect(prompt).toContain('never claim that league data');
  expect(prompt).toContain('Never expose or speculate about Azure, OpenAI');
});

test('routes release-announcement questions through the no-argument read tool', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain('get_whats_new — the latest F1 Fantasy Bot release announcement');
  expect(prompt).toContain('release notes, recent bot updates, changelog');
  expect(prompt).toContain('call get_whats_new with no arguments');
  expect(prompt).toContain('Do not translate, rewrite, or');
  expect(prompt).toContain('status="empty"');
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
  expect(prompt).toContain(
    'list_followed_teams immediately with selectionMode="unfollow_team"',
  );
  expect(prompt).toMatch(
    /Do NOT\s+ask the user to type a team name or league/,
  );
  expect(prompt).toContain(
    'A canonical teamId removal may\n    omit leagueCode',
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
