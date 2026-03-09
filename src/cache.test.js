const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  selectedChipCache,
  userCache,
  getPrintableCache,
  getSelectedTeam,
  getUserTeamIds,
  resolveSelectedTeam,
  getBestTeamWeights,
} = require('./cache');

const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
} = require('./constants');

describe('cache', () => {
  describe('getPrintableCache', () => {
    const chatId = '12345';

    afterEach(() => {
      delete driversCache[chatId];
      delete constructorsCache[chatId];
      delete currentTeamCache[chatId];
      delete selectedChipCache[chatId];
      delete userCache[chatId];
    });

    it('driversCache', () => {
      driversCache[chatId] = {
        HAM: {
          DR: 'HAM',
          price: 30,
          expectedPriceChange: 2,
          expectedPoints: 50,
        },
        LEC: {
          DR: 'LEC',
          price: 27,
          expectedPriceChange: 5,
          expectedPoints: 40,
        },
      };

      const result = getPrintableCache(chatId, DRIVERS_PHOTO_TYPE);
      expect(result).toEqual(`\`\`\`json
[
  {
    \"DR\": \"HAM\",
    \"price\": 30,
    \"expectedPriceChange\": 2,
    \"expectedPoints\": 50
  },
  {
    \"DR\": \"LEC\",
    \"price\": 27,
    \"expectedPriceChange\": 5,
    \"expectedPoints\": 40
  }
]
\`\`\``);
    });

    it('constructorsCache', () => {
      constructorsCache[chatId] = {
        MCL: {
          CN: 'MCL',
          price: 60,
          expectedPriceChange: 7,
          expectedPoints: 200,
        },
        MER: {
          CN: 'MER',
          price: 50,
          expectedPriceChange: 3,
          expectedPoints: 100,
        },
      };
      const result = getPrintableCache(chatId, CONSTRUCTORS_PHOTO_TYPE);
      expect(result).toEqual(`\`\`\`json
[
  {
    \"CN\": \"MCL\",
    \"price\": 60,
    \"expectedPriceChange\": 7,
    \"expectedPoints\": 200
  },
  {
    \"CN\": \"MER\",
    \"price\": 50,
    \"expectedPriceChange\": 3,
    \"expectedPoints\": 100
  }
]
\`\`\``);
    });

    it('currentTeamCache with selected team', () => {
      currentTeamCache[chatId] = {
        T1: {
          drivers: ['L. Hamilton'],
          constructors: ['Mercedes'],
          drsBoost: 'L. Hamilton',
          freeTransfers: 2,
          costCapRemaining: 10,
        },
      };
      userCache[chatId] = {
        selectedTeam: 'T1',
        bestTeamPriceWeights: {
          T1: 0.25,
          T2: 0.75,
        },
      };

      const result = getPrintableCache(chatId, CURRENT_TEAM_PHOTO_TYPE);
      expect(result).toEqual(`\`\`\`json
{
  \"drivers\": [
    \"L. Hamilton\"
  ],
  \"constructors\": [
    \"Mercedes\"
  ],
  \"drsBoost\": \"L. Hamilton\",
  \"freeTransfers\": 2,
  \"costCapRemaining\": 10
}
\`\`\``);
    });

    it('currentTeamCache without selected team shows all teams', () => {
      currentTeamCache[chatId] = {
        T1: {
          drivers: ['L. Hamilton'],
          constructors: ['Mercedes'],
        },
        T2: {
          drivers: ['M. Verstappen'],
          constructors: ['Red Bull'],
        },
      };

      const result = getPrintableCache(chatId, CURRENT_TEAM_PHOTO_TYPE);
      const parsed = JSON.parse(
        result.replace(/```json\n/, '').replace(/\n```/, ''),
      );
      expect(parsed).toEqual({
        T1: { drivers: ['L. Hamilton'], constructors: ['Mercedes'] },
        T2: { drivers: ['M. Verstappen'], constructors: ['Red Bull'] },
      });
    });

    it('returns all caches when type is not passed', () => {
      driversCache[chatId] = {
        VER: {
          DR: 'VER',
          price: 40,
          expectedPriceChange: 3,
          expectedPoints: 60,
        },
      };
      constructorsCache[chatId] = {
        RBR: {
          CN: 'RBR',
          price: 70,
          expectedPriceChange: 8,
          expectedPoints: 250,
        },
      };
      currentTeamCache[chatId] = {
        T1: {
          drivers: ['M. Verstappen'],
          constructors: ['Red Bull'],
          drsBoost: 'M. Verstappen',
          freeTransfers: 1,
          costCapRemaining: 5,
        },
      };

      const result = getPrintableCache(chatId);
      const parsed = JSON.parse(
        result.replace(/```json\n/, '').replace(/\n```/, ''),
      );
      expect(parsed.Drivers).toEqual([
        { DR: 'VER', price: 40, expectedPriceChange: 3, expectedPoints: 60 },
      ]);
      expect(parsed.Constructors).toEqual([
        { CN: 'RBR', price: 70, expectedPriceChange: 8, expectedPoints: 250 },
      ]);
      expect(parsed.Teams).toBeDefined();
      expect(parsed.Teams['T1']).toEqual({
        drivers: ['M. Verstappen'],
        constructors: ['Red Bull'],
        drsBoost: 'M. Verstappen',
        freeTransfers: 1,
        costCapRemaining: 5,
        bestTeamPriceWeight: 0,
      });
    });

    it('includes SelectedTeam field in all caches view', () => {
      currentTeamCache[chatId] = {
        T1: { drivers: ['VER'] },
        T2: { drivers: ['HAM'] },
      };
      userCache[chatId] = {
        selectedTeam: 'T1',
        bestTeamPriceWeights: {
          T1: 0.25,
          T2: 0.75,
        },
      };

      const result = getPrintableCache(chatId);
      const parsed = JSON.parse(
        result.replace(/```json\n/, '').replace(/\n```/, ''),
      );
      expect(parsed.SelectedTeam).toBe('T1');
      expect(parsed.Teams['T1']).toEqual({
        drivers: ['VER'],
        bestTeamPriceWeight: 0.25,
      });
      expect(parsed.Teams['T2']).toEqual({
        drivers: ['HAM'],
        bestTeamPriceWeight: 0.75,
      });
    });

    it('includes SelectedTeam as null when no team selected', () => {
      currentTeamCache[chatId] = {
        T1: { drivers: ['VER'] },
      };

      const result = getPrintableCache(chatId);
      const parsed = JSON.parse(
        result.replace(/```json\n/, '').replace(/\n```/, ''),
      );
      expect(parsed.SelectedTeam).toBeNull();
      expect(parsed.Teams['T1']).toEqual({
        drivers: ['VER'],
        bestTeamPriceWeight: 0,
      });
    });

    it('returns empty arrays/objects when caches are missing and type is not passed', () => {
      delete driversCache[chatId];
      delete constructorsCache[chatId];
      delete currentTeamCache[chatId];

      const result = getPrintableCache(chatId);
      const parsed = JSON.parse(
        result.replace(/```json\n/, '').replace(/\n```/, ''),
      );
      expect(parsed.Drivers).toEqual([]);
      expect(parsed.Constructors).toEqual([]);
      expect(parsed.Teams).toEqual({});
    });

    it('returns null for unknown type', () => {
      const result = getPrintableCache(chatId, 'UNKNOWN_TYPE');
      expect(result).toBeNull();
    });

    it('returns null for missing driversCache', () => {
      delete driversCache[chatId];
      const result = getPrintableCache(chatId, DRIVERS_PHOTO_TYPE);
      expect(result).toBeNull();
    });

    it('returns null for missing constructorsCache', () => {
      delete constructorsCache[chatId];
      const result = getPrintableCache(chatId, CONSTRUCTORS_PHOTO_TYPE);
      expect(result).toBeNull();
    });

    it('returns null for missing currentTeamCache', () => {
      delete currentTeamCache[chatId];
      const result = getPrintableCache(chatId, CURRENT_TEAM_PHOTO_TYPE);
      expect(result).toBeNull();
    });
  });

  describe('getSelectedTeam', () => {
    const chatId = '99999';

    afterEach(() => {
      delete userCache[chatId];
    });

    it('returns null when user has no cache entry', () => {
      expect(getSelectedTeam(chatId)).toBeNull();
    });

    it('returns null when user has no selectedTeam', () => {
      userCache[chatId] = { lang: 'en' };
      expect(getSelectedTeam(chatId)).toBeNull();
    });

    it('returns the selected team', () => {
      userCache[chatId] = { selectedTeam: 'T2' };
      expect(getSelectedTeam(chatId)).toBe('T2');
    });
  });

  describe('getUserTeamIds', () => {
    const chatId = '88888';

    afterEach(() => {
      delete currentTeamCache[chatId];
    });

    it('returns empty array when no teams exist', () => {
      expect(getUserTeamIds(chatId)).toEqual([]);
    });

    it('returns team IDs from currentTeamCache', () => {
      currentTeamCache[chatId] = {
        T1: { drivers: ['VER'] },
        T3: { drivers: ['HAM'] },
      };
      expect(getUserTeamIds(chatId)).toEqual(['T1', 'T3']);
    });
  });

  describe('resolveSelectedTeam', () => {
    const chatId = '77777';
    const mockBot = { sendMessage: jest.fn() };

    afterEach(() => {
      delete currentTeamCache[chatId];
      delete userCache[chatId];
      jest.clearAllMocks();
    });

    it('returns null and sends message when no teams', async () => {
      const result = await resolveSelectedTeam(mockBot, chatId);
      expect(result).toBeNull();
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('upload a team screenshot'),
      );
    });

    it('returns the only team when user has exactly one', async () => {
      currentTeamCache[chatId] = { T1: { drivers: ['VER'] } };
      const result = await resolveSelectedTeam(mockBot, chatId);
      expect(result).toBe('T1');
      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });

    it('returns selected team when user has multiple teams and a selection', async () => {
      currentTeamCache[chatId] = {
        T1: { drivers: ['VER'] },
        T2: { drivers: ['HAM'] },
      };
      userCache[chatId] = { selectedTeam: 'T2' };

      const result = await resolveSelectedTeam(mockBot, chatId);
      expect(result).toBe('T2');
      expect(mockBot.sendMessage).not.toHaveBeenCalled();
    });

    it('returns null and sends message when multiple teams but no selection', async () => {
      currentTeamCache[chatId] = {
        T1: { drivers: ['VER'] },
        T2: { drivers: ['HAM'] },
      };

      const result = await resolveSelectedTeam(mockBot, chatId);
      expect(result).toBeNull();
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('/select_team'),
      );
    });

    it('returns null when selected team is not in current teams', async () => {
      currentTeamCache[chatId] = {
        T1: { drivers: ['VER'] },
        T2: { drivers: ['HAM'] },
      };
      userCache[chatId] = { selectedTeam: 'T3' };

      const result = await resolveSelectedTeam(mockBot, chatId);
      expect(result).toBeNull();
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining('/select_team'),
      );
    });
  });


  describe('getBestTeamWeights', () => {
    const chatId = '66666';

    afterEach(() => {
      delete userCache[chatId];
    });

    it('returns defaults when team-specific weights are missing', () => {
      expect(getBestTeamWeights(chatId, 'T1')).toEqual({
        pointsWeight: 1,
        priceChangeWeight: 0,
      });
    });


    it('supports bestTeamPriceWeights stored as JSON string', () => {
      userCache[chatId] = {
        bestTeamPriceWeights: JSON.stringify({
          T2: 0.75,
        }),
      };

      expect(getBestTeamWeights(chatId, 'T2')).toEqual({
        pointsWeight: 0.25,
        priceChangeWeight: 0.75,
      });
    });

    it('returns team-specific weights when set', () => {
      userCache[chatId] = {
        bestTeamPriceWeights: {
          T2: 0.75,
        },
      };

      expect(getBestTeamWeights(chatId, 'T2')).toEqual({
        pointsWeight: 0.25,
        priceChangeWeight: 0.75,
      });
    });
  });

});
