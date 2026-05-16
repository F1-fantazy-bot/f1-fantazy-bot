const { KILZI_CHAT_ID } = require('../constants');
const {
  currentTeamCache,
  selectedChipCache,
  userCache,
} = require('../cache');

const { listUserTeams } = require('./userTeamsCore');

describe('listUserTeams', () => {
  beforeEach(() => {
    delete currentTeamCache[KILZI_CHAT_ID];
    delete selectedChipCache[KILZI_CHAT_ID];
    delete userCache[String(KILZI_CHAT_ID)];
  });

  it('returns empty array when chat has no teams', () => {
    expect(listUserTeams({ chatId: KILZI_CHAT_ID })).toEqual([]);
  });

  it('returns shaped data for screenshot teams (no underscore in teamId)', () => {
    currentTeamCache[KILZI_CHAT_ID] = {
      T1: {
        drivers: ['VER', 'HAM'],
        constructors: ['RED'],
        boost: 'VER',
        freeTransfers: 1,
        costCapRemaining: 2.5,
      },
    };
    const result = listUserTeams({ chatId: KILZI_CHAT_ID });
    expect(result).toEqual([
      {
        teamId: 'T1',
        teamName: 'T1',
        isLeague: false,
        isSelected: false,
        chip: null,
        drivers: ['VER', 'HAM'],
        constructors: ['RED'],
        boost: 'VER',
        freeTransfers: 1,
        costCapRemaining: 2.5,
      },
    ]);
  });

  it('marks league teams (underscore in teamId) and exposes teamName', () => {
    currentTeamCache[KILZI_CHAT_ID] = {
      Doron_3: {
        drivers: ['VER'],
        constructors: ['RED'],
        teamName: 'kilzid3',
      },
    };
    const [team] = listUserTeams({ chatId: KILZI_CHAT_ID });
    expect(team.isLeague).toBe(true);
    expect(team.teamName).toBe('kilzid3');
  });

  it('marks the selected team via userCache.selectedTeam', () => {
    currentTeamCache[KILZI_CHAT_ID] = {
      T1: { drivers: [], constructors: [] },
      T2: { drivers: [], constructors: [] },
    };
    userCache[String(KILZI_CHAT_ID)] = { selectedTeam: 'T2' };

    const result = listUserTeams({ chatId: KILZI_CHAT_ID });
    expect(result.find((t) => t.teamId === 'T2').isSelected).toBe(true);
    expect(result.find((t) => t.teamId === 'T1').isSelected).toBe(false);
  });

  it('passes the active chip per team', () => {
    currentTeamCache[KILZI_CHAT_ID] = {
      T1: { drivers: [], constructors: [] },
    };
    selectedChipCache[KILZI_CHAT_ID] = { T1: 'EXTRA_BOOST' };
    const [team] = listUserTeams({ chatId: KILZI_CHAT_ID });
    expect(team.chip).toBe('EXTRA_BOOST');
  });
});
