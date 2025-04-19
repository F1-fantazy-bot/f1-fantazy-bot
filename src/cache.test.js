const {
  driversCache,
  constructorsCache,
  currentTeamCache,
  getPrintableCache,
} = require('./cache');

const {
  DRIVERS_PHOTO_TYPE,
  CONSTRUCTORS_PHOTO_TYPE,
  CURRENT_TEAM_PHOTO_TYPE,
} = require('./constants');

describe('cache', () => {
  describe('getPrintableCache', () => {
    const chatId = '12345';
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

    it('currentTeamCache', () => {
      currentTeamCache[chatId] = {
        drivers: ['L. Hamilton'],
        constructors: ['Mercedes'],
        drsBoost: 'L. Hamilton',
        freeTransfers: 2,
        costCapRemaining: 10,
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
        drivers: ['M. Verstappen'],
        constructors: ['Red Bull'],
        drsBoost: 'M. Verstappen',
        freeTransfers: 1,
        costCapRemaining: 5,
      };

      const result = getPrintableCache(chatId);
      expect(result).toEqual(`\`\`\`json
{
  "Drivers": [
    {
      "DR": "VER",
      "price": 40,
      "expectedPriceChange": 3,
      "expectedPoints": 60
    }
  ],
  "Constructors": [
    {
      "CN": "RBR",
      "price": 70,
      "expectedPriceChange": 8,
      "expectedPoints": 250
    }
  ],
  "CurrentTeam": {
    "drivers": [
      "M. Verstappen"
    ],
    "constructors": [
      "Red Bull"
    ],
    "drsBoost": "M. Verstappen",
    "freeTransfers": 1,
    "costCapRemaining": 5
  }
}
\`\`\``);
    });

    it('returns empty arrays/objects when caches are missing and type is not passed', () => {
      delete driversCache[chatId];
      delete constructorsCache[chatId];
      delete currentTeamCache[chatId];

      const result = getPrintableCache(chatId);
      expect(result).toEqual(`\`\`\`json
{
  "Drivers": [],
  "Constructors": [],
  "CurrentTeam": {}
}
\`\`\``);
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
});
