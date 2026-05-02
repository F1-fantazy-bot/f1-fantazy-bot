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
  listLockedMatchdays: jest.fn(),
}));

const { listUserLeagues } = require('../leagueRegistryService');
const {
  getLockedTeamsData,
  listLockedMatchdays,
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

    it('only shows newly-activated chips (set diff)', () => {
      const prev = mkTeam({ chipsUsed: [{ name: 'Wildcard' }] });
      const latest = mkTeam({
        chipsUsed: [{ name: 'Wildcard' }, { name: 'Limitless' }],
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

    it('renders header with both matchday IDs', () => {
      const prev = mkSnapshot(3, [
        {
          teamName: 'A',
          userName: 'u1',
          position: 1,
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
          drivers: [{ name: 'Y', isCaptain: true }],
          constructors: [],
          chipsUsed: [],
        },
      ]);
      const out = formatLeagueChanges(latest, prev, chatId);

      expect(out).toContain('🔄 Amba — matchday 3 → 4');
      expect(out).toContain('🥇 <b>A</b>');
      expect(out).toContain('-X');
      expect(out).toContain('+Y');
    });

    it('matches teams across snapshots by userName, not position', () => {
      const prev = mkSnapshot(3, [
        {
          teamName: 'OldName',
          userName: 'u1',
          position: 5,
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
      const prev = mkSnapshot(3, []);
      const latest = mkSnapshot(4, [
        {
          teamName: 'NewTeam',
          userName: 'newU',
          position: 1,
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
        drivers: [{ name: 'D', isCaptain: true }],
        constructors: [{ name: 'C' }],
        chipsUsed: [],
      });
      const prev = mkSnapshot(3, ['t1', 't2', 't3'].map(team));
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
        drivers: [{ name: 'V', isCaptain: true }],
        constructors: [{ name: 'F' }],
        chipsUsed: [],
      };
      const out = formatLeagueChanges(
        mkSnapshot(4, [team]),
        mkSnapshot(3, [team]),
        chatId,
      );

      expect(out).toContain('No team changes between matchday 3 and 4.');
    });

    it('escapes HTML in the league name', () => {
      const out = formatLeagueChanges(
        { mode: 'locked', leagueCode: 'X', leagueName: '<bad>', matchdayId: 4, teams: [] },
        { mode: 'locked', leagueCode: 'X', leagueName: '<bad>', matchdayId: 3, teams: [] },
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
    it('messages "no snapshots" when none exist', async () => {
      listLockedMatchdays.mockResolvedValueOnce([]);

      await sendLeagueChanges(botMock, chatId, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('No locked-roster snapshots'),
      );
      expect(getLockedTeamsData).not.toHaveBeenCalled();
    });

    it('messages "only one" when exactly one snapshot exists', async () => {
      listLockedMatchdays.mockResolvedValueOnce([4]);

      await sendLeagueChanges(botMock, chatId, 'ABC');

      expect(botMock.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('Only one locked snapshot'),
      );
      expect(getLockedTeamsData).not.toHaveBeenCalled();
    });

    it('fetches the two latest snapshots and renders the diff', async () => {
      listLockedMatchdays.mockResolvedValueOnce([2, 3, 4]);
      const prev = {
        leagueCode: 'ABC', leagueName: 'Amba', matchdayId: 3,
        teams: [{
          teamName: 'A', userName: 'u', position: 1,
          drivers: [{ name: 'X', isCaptain: true }], constructors: [], chipsUsed: [],
        }],
      };
      const latest = {
        leagueCode: 'ABC', leagueName: 'Amba', matchdayId: 4,
        teams: [{
          teamName: 'A', userName: 'u', position: 1,
          drivers: [{ name: 'Y', isCaptain: true }], constructors: [], chipsUsed: [],
        }],
      };
      getLockedTeamsData
        .mockImplementation((_lc, mdid) => Promise.resolve(mdid === 4 ? latest : prev));

      await sendLeagueChanges(botMock, chatId, 'ABC');

      expect(getLockedTeamsData).toHaveBeenCalledWith('ABC', 4);
      expect(getLockedTeamsData).toHaveBeenCalledWith('ABC', 3);
      const [, body, opts] = botMock.sendMessage.mock.calls[0];
      expect(body).toContain('🔄 Amba — matchday 3 → 4');
      expect(body).toContain('-X');
      expect(body).toContain('+Y');
      expect(opts).toEqual({ parse_mode: 'HTML' });
    });

    it('falls back to "no snapshots" when one of the two blobs is missing', async () => {
      listLockedMatchdays.mockResolvedValueOnce([3, 4]);
      getLockedTeamsData
        .mockResolvedValueOnce({ matchdayId: 4, teams: [] })
        .mockResolvedValueOnce(null);

      await sendLeagueChanges(botMock, chatId, 'ABC');

      expect(botMock.sendMessage).toHaveBeenLastCalledWith(
        chatId,
        expect.stringContaining('No locked-roster snapshots'),
      );
    });

    it('reports listing errors gracefully', async () => {
      listLockedMatchdays.mockRejectedValueOnce(new Error('boom'));

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
      listLockedMatchdays.mockResolvedValueOnce([]);

      await handleLeagueChangesCommand(botMock, msg);

      expect(listLockedMatchdays).toHaveBeenCalledWith('ABC');
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
