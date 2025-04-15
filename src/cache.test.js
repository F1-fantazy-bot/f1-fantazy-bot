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
  });
});
