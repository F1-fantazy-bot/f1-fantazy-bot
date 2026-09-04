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

test('routes administrative reads through centrally guarded no-argument tools', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain('get_admin_version — admin-only deployed commit');
  expect(prompt).toContain('get_billing_stats — admin-only current and previous');
  expect(prompt).toContain('list_bot_users — admin-only, bounded');
  expect(prompt).toContain('list_web_users — admin-only, bounded');
  expect(prompt).toContain('get_botfather_setup — admin-only copyable');
  expect(prompt).toContain('guided-selection mode and optional pending');
  expect(prompt).toMatch(/server checks the authenticated\s+identity before it reads any data/);
  expect(prompt).toContain('status="forbidden"');
  expect(prompt).toContain('do not ask the tool to bypass its\n    safe output cap');
});

test('routes confirmed admin identity and access writes through guided canonical targets', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain('set_user_nickname — admin-only confirmed');
  expect(prompt).toContain('allow_web_user — admin-only confirmed');
  expect(prompt).toContain('revoke_web_user — admin-only confirmed');
  expect(prompt).toContain('selectionMode="set_user_nickname"');
  expect(prompt).toContain('selectionMode="allow_web_user"');
  expect(prompt).toContain('selectionMode="revoke_web_user"');
  expect(prompt).toMatch(/do NOT\s+ask the administrator to type a chat ID/i);
  expect(prompt).toMatch(
    /do NOT ask the administrator to type an existing email/i,
  );
  expect(prompt).toContain('Never call confirm_write before the user clicks');
  expect(prompt).toMatch(/target changed while the card\s+was open/);
});

test('routes confirmed admin messaging through guided recipients and a fresh broadcast audience', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain('send_user_message — admin-only confirmed');
  expect(prompt).toContain('broadcast_message — admin-only confirmed');
  expect(prompt).toContain('selectionMode="send_user_message"');
  expect(prompt).toMatch(/do NOT ask\s+the administrator to type one/i);
  expect(prompt).toContain('The agent supports text-only administrator messages');
  expect(prompt).toMatch(
    /confirmation\s+preview includes the current recipient count/,
  );
  expect(prompt).toContain('audience at commit');
  expect(prompt).toMatch(
    /Never\s+expose provider, HTTP, storage, or Telegram delivery errors/,
  );
});

test('routes confirmed admin manual triggers through one safe leased job at a time', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain('trigger_scraping — admin-only confirmed');
  expect(prompt).toContain('trigger_api_data — admin-only confirmed');
  expect(prompt).toContain('trigger_api_data_locked — admin-only confirmed');
  expect(prompt).toContain('trigger_next_race_info — admin-only confirmed');
  expect(prompt).toContain('trigger_live_score_scheduler — admin-only confirmed');
  expect(prompt).toContain('Never accept an arbitrary trigger');
  expect(prompt).toContain('different impact preview');
  expect(prompt).toMatch(/active\/recent or uncertain run/);
  expect(prompt).toMatch(
    /Never expose Azure, HTTP, storage, credential, or workflow errors/,
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

test('routes simulation and safe data diagnostics through their read tools', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'get_simulation_status — safe shared-simulation source, matchday, local',
  );
  expect(prompt).toContain(
    'get_data_status — safe readiness summary plus the authenticated user\'s',
  );
  expect(prompt).toContain('For the loaded simulation, its source, next-race relevance');
  expect(prompt).toContain('**get_simulation_status**.');
  expect(prompt).toContain('For data readiness, projection availability');
  expect(prompt).toContain('call **get_data_status**');
  expect(prompt).toContain('a request to show/print the user\'s cache');
  expect(prompt).toContain('cache data cannot be shown');
  expect(prompt).toContain('reproduce raw cache');
  expect(prompt).toContain('Both diagnostics are no-argument, read-only tools');
  expect(prompt).toContain('All user-facing diagnostic dates and times use Asia/Jerusalem');
  expect(prompt).toContain('updatedAtLocal value verbatim');
  expect(prompt).toContain('Simulation status is race-based, not time-based');
  expect(prompt).toContain('saved points-per-million ranking preset');
  expect(prompt).toContain('never speculate about storage, HTTP, Azure');
});

test('routes explicit simulation refreshes through durable confirmation', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain(
    'load_latest_simulation — confirmed refresh of the latest shared F1 Fantasy',
  );
  expect(prompt).toContain('For an explicit request to refresh, load, or update');
  expect(prompt).toContain('call **load_latest_simulation** with no arguments');
  expect(prompt).toContain('The confirmation card is required');
  expect(prompt).toContain('do not call confirm_write before the user clicks Yes');
  expect(prompt).toContain('this Function process refreshed');
  expect(prompt).toContain('same durable shared source');
  expect(prompt).toContain('Never expose or speculate about Blob, Azure, HTTP');
});

test('routes destructive user-data resets through durable confirmation', () => {
  const prompt = getSystemPrompt();

  expect(prompt).toContain('reset_user_data — permanently delete');
  expect(prompt).toContain('For an explicit request to reset, delete, or clear all saved F1 Fantasy');
  expect(prompt).toContain('call **reset_user_data** with no arguments');
  expect(prompt).toContain('This is destructive and always requires the confirmation card');
  expect(prompt).toMatch(/Do not use this for\s+resetting a chip/);
  expect(prompt).toMatch(
    /saved team\s+blobs, active-team setting, per-team\s+preferences/,
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
