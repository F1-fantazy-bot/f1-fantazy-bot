const {
  handleLeagueChangesCommand,
  sendLeagueChanges,
  formatLeagueChanges,
  diffTeam,
} = require('./leagueChangesHandler');

jest.mock('../i18n', () => ({
  t: jest.fn((key, _chatId, vars) =>
    vars
      ? Object.entries(vars).reduce(
          (acc, [k, v]) => acc.replace(`{${k}}`, v),
          key,
        )
      : key,
  ),
}));

jest.mock('../leagueRegistryService', () => ({
  listUserLeagues: jest.fn(),
}));

jest.mock('../azureStorageService', () => ({
  getLockedTeamsData: jest.fn(),
  getLeagueTeamsData: jest.fn(),
}));

const { listUserLeagues } = require('../leagueRegistryService');
const {
  getLockedTeamsData,
  getLeagueTeamsData,
} = require('../azureStorageService');

describe('leagueChangesHandler', () => {
  let botMock;
  const chatId = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    botMock = { sendMessage: jest.fn().mockResolvedValue() };
  });

  // -------------------------------------------------------------------
  // diffTeam
  // -------------------------------------------------------------------
  describe('diffTeam', () => {
    const mkTeam = (overrides = {}) => ({
      teamName: 'A',
      userName: 'u1',
      position: 1,
      matchdayId: 4,
      drivers: [
        { name: 'Verstappen', isCaptain: true, isMegaCaptain: false },
        { name: 'Norris', isCaptain: false, isMegaCaptain: false },
      ],
      constructors: [{ name: 'Ferrari' }],
      chipsUsed: [],
      ...overrides,
    });

    it('emits "new team" when previous is missing', () => {
      const result = diffTeam(mkTeam(), null, chatId);

      expect(result.hasChanges).toBe(true);
      expect(result.lines.join('\n')).toContain('🆕 new team');
    });

    it('returns no changes when nothing differs', () => {
      const team = mkTeam();
      const result = diffTeam(team, team, chatId);

      expect(result.hasChanges).toBe(false);
      expect(result.lines).toEqual([]);
    });

    it('shows driver in/out diff', () => {
      const prev = mkTeam();
      const latest = mkTeam({
        drivers: [
          { name: 'Verstappen', isCaptain: true },
          { name: 'Leclerc' },
        ],
      });
      const result = diffTeam(latest, prev, chatId);

      expect(result.hasChanges).toBe(true);
      const text = result.lines.join('\n');
      expect(text).toContain('-Norris');
      expect(text).toContain('+Leclerc');
    });

    it('shows constructor in/out diff', () => {
      const prev = mkTeam({ constructors: [{ name: 'Ferrari' }] });
      const latest = mkTeam({ constructors: [{ name: 'McLaren' }] });
      const result = diffTeam(latest, prev, chatId);

      const text = result.lines.join('\n');
      expect(text).toContain('-Ferrari');
      expect(text).toContain('+McLaren');
    });

    it('shows captain change', () => {
      const prev = mkTeam();
      const latest = mkTeam({
        drivers: [
          { name: 'Verstappen', isCaptain: false },
          { name: 'Norris', isCaptain: true },
        ],
      });
      const result = diffTeam(latest, prev, chatId);

      expect(result.lines.join('\n')).toContain(
        'Captain: Verstappen → Norris',
      );
    });

    it('shows mega captain change', () => {
      const prev = mkTeam({
        drivers: [
          { name: 'Verstappen', isMegaCaptain: false },
          { name: 'Norris', isMegaCaptain: false },
        ],
      });
      const latest = mkTeam({
        drivers: [
          { name: 'Verstappen', isMegaCaptain: true },
          { name: 'Norris', isMegaCaptain: false },
        ],
      });
      const result = diffTeam(latest, prev, chatId);

      expect(result.lines.join('\n')).toContain(
        'Mega captain: — → Verstappen',
      );
    });

    it('shows only chips activated for the current matchday (gameDayId === matchdayId)', () => {
      const prev = mkTeam({
        chipsUsed: [{ name: 'Wildcard', gameDayId: 1 }],
      });
      const latest = mkTeam({
        matchdayId: 4,
        // Limitless was activated for md=2 (historical), Extra DRS Boost
        // was activated for md=4 (current week). Only the latter renders.
        chipsUsed: [
          { name: 'Wildcard', gameDayId: 1 },
          { name: 'Limitless', gameDayId: 2 },
          { name: 'Extra DRS Boost', gameDayId: 4 },
        ],
      });
      const result = diffTeam(latest, prev, chatId);

      const text = result.lines.join('\n');
      expect(text).toContain('Chip: Extra DRS Boost');
      expect(text).not.toContain('Chip: Wildcard');
      expect(text).not.toContain('Chip: Limitless');
    });

    it('shows no chip line when no chip was activated this matchday', () => {
      const prev = mkTeam();
      const latest = mkTeam({
        matchdayId: 4,
        chipsUsed: [
          { name: 'Wildcard', gameDayId: 1 },
          { name: 'Limitless', gameDayId: 2 },
        ],
      });
      const result = diffTeam(latest, prev, chatId);

      // Roster is identical; only historical chips → no diff at all.
      expect(result.hasChanges).toBe(false);
    });

    it('treats chip entries without gameDayId as historical (filtered out)', () => {
      const prev = mkTeam();
      const latest = mkTeam({
        matchdayId: 4,
        chipsUsed: [{ name: 'Wildcard' }, { name: 'Limitless', gameDayId: 4 }],
      });
      const result = diffTeam(latest, prev, chatId);

      const text = result.lines.join('\n');
      expect(text).toContain('Chip: Limitless');
      expect(text).not.toContain('Chip: Wildcard');
    });

    it('escapes HTML in driver / constructor names', () => {
      const prev = mkTeam();
      const latest = mkTeam({
        drivers: [
          { name: 'Verstappen', isCaptain: true },
          { name: '<evil>', isCaptain: false },
        ],
      });
      const result = diffTeam(latest, prev, chatId);

      const text = result.lines.join('\n');
      expect(text).toContain('-Norris');
      expect(text).toContain('+&lt;evil&gt;');
      expect(text).not.toContain('<evil>');
    });
  });

  // -------------------------------------------------------------------
  // formatLeagueChanges
  // -------------------------------------------------------------------
  describe('formatLeagueChanges', () => {
    const mkSnapshot = (matchdayId, teams) => ({
      mode: 'locked',
      leagueCode: 'ABC',
      leagueName: 'Amba',
      matchdayId,
      teams,
    });

    it('renders header with the single matchday ID', () => {
      const prev = mkSnapshot(4, [
        {
          teamName: 'A',
          userName: 'u1',
          position: 1,
          matchdayId: 4,
          drivers: [{ name: 'X', isCaptain: true }],
          constructors: [],
          chipsUsed: [],
        },
      ]);
      const latest = mkSnapshot(4, [
        {
          teamName: 'A',
          userName: 'u1',
          position: 1,
          matchdayId: 4,
          drivers: [{ name: 'Y', isCaptain: true }],
          constructors: [],
          chipsUsed: [],
        },
      ]);
      const out = formatLeagueChanges(latest, prev, chatId);

      expect(out).toContain('🔄 Amba — matchday 4 (planning → locked)');
      expect(out).toContain('🥇 <b>A</b>');
      expect(out).toContain('-X');
      expect(out).toContain('+Y');
    });

    it('matches teams across snapshots by userName, not position', () => {
      const prev = mkSnapshot(4, [
        {
          teamName: 'OldName',
          userName: 'u1',
          position: 5,
          matchdayId: 4,
          drivers: [{ name: 'X', isCaptain: true }],
          constructors: [],
          chipsUsed: [],
        },
      ]);
      const latest = mkSnapshot(4, [
        {
          teamName: 'NewName',
          userName: 'u1',
          position: 1,
          matchdayId: 4,
          drivers: [{ name: 'Y', isCaptain: true }],
          constructors: [],
          chipsUsed: [],
        },
      ]);
      const out = formatLeagueChanges(latest, prev, chatId);

      expect(out).toContain('🥇 <b>NewName</b>');
      expect(out).toContain('-X');
      expect(out).toContain('+Y');
      expect(out).not.toContain('🆕 new team');
    });

    it('marks teams that did not exist in previous as new', () => {
      const prev = mkSnapshot(4, []);
      const latest = mkSnapshot(4, [
        {
          teamName: 'NewTeam',
          userName: 'newU',
          position: 1,
          matchdayId: 4,
          drivers: [{ name: 'X' }],
          constructors: [],
          chipsUsed: [],
        },
      ]);
      const out = formatLeagueChanges(latest, prev, chatId);

      expect(out).toContain('🆕 new team');
    });

    it('summarises unchanged teams in a tail line', () => {
      const team = (n) => ({
        teamName: n,
        userName: n,
        position: parseInt(n.replace('t', ''), 10),
        matchdayId: 4,
        drivers: [{ name: 'D', isCaptain: true }],
        constructors: [{ name: 'C' }],
        chipsUsed: [],
      });
      const prev = mkSnapshot(4, ['t1', 't2', 't3'].map(team));
      const latestTeams = ['t1', 't2', 't3'].map(team);
      latestTeams[0] = {
        ...latestTeams[0],
        drivers: [{ name: 'Z', isCaptain: true }],
      };
      const latest = mkSnapshot(4, latestTeams);

      const out = formatLeagueChanges(latest, prev, chatId);

      expect(out).toContain('🥇 <b>t1</b>');
      expect(out).toContain('(2 other team(s) had no changes)');
    });

    it('renders an explicit no-changes message when nothing changed', () => {
      const team = {
        teamName: 'A',
        userName: 'u1',
        position: 1,
        matchdayId: 4,
        drivers: [{ name: 'V', isCaptain: true }],
        constructors: [{ name: 'F' }],
        chipsUsed: [],
      };
      const out = formatLeagueChanges(
        mkSnapshot(4, [team]),
        mkSnapshot(4, [team]),
        chatId,
      );

      expect(out).toContain('No team changes for matchday 4.');
    });

    it('escapes HTML in the league name', () => {
      const out = formatLeagueChanges(
        { mode: 'locked', leagueCode: 'X', leagueName: '<bad>', matchdayId: 4, teams: [] },
        { leagueCode: 'X', leagueName: '<bad>', matchdayId: 4, teams: [] },
        chatId,
      );

      expect(out).toContain('🔄 &lt;bad&gt;');
      expect(out).not.toContain('<bad>');
    });
  });

  // -------------------------------------------------------------------
  // sendLeagueChanges
  // -------------------------------------------------------------------
  describe('sendLeagueChanges', () => {
    it('messages "no snapshots" when no locked snapshot exists', async () => {
      getLockedTeamsData.mockResolvedValueOnce(null);
      getLeagueTeamsData.mockResolvedValueOnce({ matchdayId: 4, teams: [] });

      await sendLeagueChanges(botMock, chatId, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('No locked-roster snapshots'),
      );
    });

    it('messages "league data not yet available" when teams-data is missing', async () => {
      getLockedTeamsData.mockResolvedValueOnce({ matchdayId: 4, teams: [] });
      getLeagueTeamsData.mockResolvedValueOnce(null);

      await sendLeagueChanges(botMock, chatId, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('League data is not yet available'),
      );
    });

    it('messages "wait for next session lock" when matchdayIds mismatch', async () => {
      getLockedTeamsData.mockResolvedValueOnce({ matchdayId: 3, teams: [] });
      getLeagueTeamsData.mockResolvedValueOnce({ matchdayId: 4, teams: [] });

      await sendLeagueChanges(botMock, chatId, 'ABC');

      const body = botMock.sendMessage.mock.calls[0][1];
      expect(body).toContain('locked snapshot is for matchday 3');
      expect(body).toContain('weekly snapshot is for matchday 4');
      expect(body).toContain('next session lock');
    });

    it('messages "wait for next session lock" when teams-data has null matchdayId', async () => {
      getLockedTeamsData.mockResolvedValueOnce({ matchdayId: 4, teams: [] });
      getLeagueTeamsData.mockResolvedValueOnce({ matchdayId: null, teams: [] });

      await sendLeagueChanges(botMock, chatId, 'ABC');

      const body = botMock.sendMessage.mock.calls[0][1];
      expect(body).toContain('next session lock');
    });

    it('fetches latest locked + teams-data and renders the diff', async () => {
      const teamsData = {
        leagueCode: 'ABC', leagueName: 'Amba', matchdayId: 4,
        teams: [{
          teamName: 'A', userName: 'u', position: 1,
          matchdayId: 4,
          drivers: [{ name: 'X', isCaptain: true }],
          constructors: [],
        }],
      };
      const latest = {
        leagueCode: 'ABC', leagueName: 'Amba', matchdayId: 4,
        teams: [{
          teamName: 'A', userName: 'u', position: 1,
          matchdayId: 4,
          drivers: [{ name: 'Y', isCaptain: true }],
          constructors: [],
          chipsUsed: [{ name: 'Wildcard', gameDayId: 4 }],
        }],
      };
      getLockedTeamsData.mockResolvedValueOnce(latest);
      getLeagueTeamsData.mockResolvedValueOnce(teamsData);

      await sendLeagueChanges(botMock, chatId, 'ABC');

      expect(getLockedTeamsData).toHaveBeenCalledWith('ABC');
      expect(getLeagueTeamsData).toHaveBeenCalledWith('ABC');
      const [, body, opts] = botMock.sendMessage.mock.calls[0];
      expect(body).toContain('🔄 Amba — matchday 4 (planning → locked)');
      expect(body).toContain('-X');
      expect(body).toContain('+Y');
      expect(body).toContain('Chip: Wildcard');
      expect(opts).toEqual({ parse_mode: 'HTML' });
    });

    it('reports fetch errors gracefully', async () => {
      getLockedTeamsData.mockRejectedValueOnce(new Error('boom'));
      getLeagueTeamsData.mockResolvedValueOnce({ matchdayId: 4, teams: [] });

      await sendLeagueChanges(botMock, chatId, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('boom'),
      );
    });
  });

  // -------------------------------------------------------------------
  // handleLeagueChangesCommand
  // -------------------------------------------------------------------
  describe('handleLeagueChangesCommand', () => {
    const msg = { chat: { id: chatId }, message_id: 99 };

    it('prompts to follow when the user follows no league', async () => {
      listUserLeagues.mockResolvedValueOnce([]);

      await handleLeagueChangesCommand(botMock, msg);

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('not following any league'),
      );
    });

    it('skips the picker for a single followed league', async () => {
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
      ]);
      getLockedTeamsData.mockResolvedValueOnce(null);
      getLeagueTeamsData.mockResolvedValueOnce({ matchdayId: 4, teams: [] });

      await handleLeagueChangesCommand(botMock, msg);

      expect(getLockedTeamsData).toHaveBeenCalledWith('ABC');
    });

    it('shows an inline-keyboard picker for multiple leagues', async () => {
      listUserLeagues.mockResolvedValueOnce([
        { leagueCode: 'ABC', leagueName: 'Amba' },
        { leagueCode: 'XYZ', leagueName: 'Xyz' },
      ]);

      await handleLeagueChangesCommand(botMock, msg);

      const [, body, opts] = botMock.sendMessage.mock.calls[0];
      expect(body).toContain('Which league changes do you want to see?');
      expect(opts.reply_markup.inline_keyboard).toEqual([
        [{ text: 'Amba', callback_data: 'LEAGUE_CHANGES:ABC' }],
        [{ text: 'Xyz', callback_data: 'LEAGUE_CHANGES:XYZ' }],
      ]);
      expect(opts.reply_to_message_id).toBe(99);
    });

    it('reports user-leagues listing errors gracefully', async () => {
      listUserLeagues.mockRejectedValueOnce(new Error('list-fail'));

      await handleLeagueChangesCommand(botMock, msg);

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('list-fail'),
      );
    });
  });
});
