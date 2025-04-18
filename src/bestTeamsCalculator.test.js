const { calculateBestTeams } = require('./bestTeamsCalculator');
const { calculateChangesToTeam } = require('./bestTeamsCalculator');

describe('calculateBestTeams', () => {
    const mockDrivers = [
        { DR: 'VER', price: 30, expectedPoints: 25, expectedPriceChange: 0.2 },
        { DR: 'HAM', price: 28, expectedPoints: 20, expectedPriceChange: 0.1 },
        { DR: 'PER', price: 25, expectedPoints: 15, expectedPriceChange: -0.1 },
        { DR: 'SAI', price: 23, expectedPoints: 18, expectedPriceChange: 0.3 },
        { DR: 'LEC', price: 24, expectedPoints: 19, expectedPriceChange: 0.1 }, 
        { DR: 'NOR', price: 20, expectedPoints: 12, expectedPriceChange: 0 }
    ];

    const mockConstructors = [
        { CN: 'RED', price: 35, expectedPoints: 30, expectedPriceChange: 0.5 },
        { CN: 'MER', price: 32, expectedPoints: 25, expectedPriceChange: 0.2 },
        { CN: 'FER', price: 30, expectedPoints: 20, expectedPriceChange: -0.1 }
    ];

    const mockCurrentTeam = {
        drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
        constructors: ['RED', 'MER'],
        drsBoost: 'VER',
        freeTransfers: 2,
        costCapRemaining: 10
    };

    const mockJsonData = {
        Drivers: mockDrivers,
        Constructors: mockConstructors, 
        CurrentTeam: mockCurrentTeam
    };

    test('should return an array of team combinations', () => {
        const result = calculateBestTeams(mockJsonData);
        expect(Array.isArray(result)).toBe(true);
    });

    test('should return max 20 teams', () => {
        const result = calculateBestTeams(mockJsonData);
        expect(result.length).toBeLessThanOrEqual(20);
    });

    test('each team should have required properties', () => {
        const result = calculateBestTeams(mockJsonData);
        const team = result[0];
        
        expect(team).toHaveProperty('row');
        expect(team).toHaveProperty('drivers');
        expect(team).toHaveProperty('constructors');
        expect(team).toHaveProperty('drs_driver');
        expect(team).toHaveProperty('total_price');
        expect(team).toHaveProperty('transfers_needed');
        expect(team).toHaveProperty('penalty');
        expect(team).toHaveProperty('projected_points');
        expect(team).toHaveProperty('expected_price_change');
    });

    test('should select driver with highest points as DRS driver', () => {
        const result = calculateBestTeams(mockJsonData);
        const team = result[0];
        const drsDriver = team.drs_driver;
        
        const drsDriverPoints = mockDrivers.find(d => d.DR === drsDriver).expectedPoints;
        const teamDrivers = team.drivers.map(d => mockDrivers.find(md => md.DR === d).expectedPoints);
        
        expect(drsDriverPoints).toBe(Math.max(...teamDrivers));
    });

    test('should calculate correct penalties based on transfers', () => {
        const result = calculateBestTeams(mockJsonData);
        
        result.forEach(team => {
            const transfersNeeded = team.transfers_needed;
            const expectedPenalty = Math.max(0, transfersNeeded - mockCurrentTeam.freeTransfers) * 10;
            expect(team.penalty).toBe(expectedPenalty);
        });
    });

    test('all teams should be within budget', () => {
        const result = calculateBestTeams(mockJsonData);
        const totalBudget = mockCurrentTeam.costCapRemaining + 
            mockCurrentTeam.drivers.reduce((sum, dr) => sum + mockDrivers.find(d => d.DR === dr).price, 0) +
            mockCurrentTeam.constructors.reduce((sum, cn) => sum + mockConstructors.find(c => c.CN === cn).price, 0);
        
        result.forEach(team => {
            expect(team.total_price).toBeLessThanOrEqual(totalBudget);
        });
    });

    test('teams should be sorted by projected points in descending order', () => {
        const result = calculateBestTeams(mockJsonData);
        
        for(let i = 1; i < result.length; i++) {
            expect(result[i-1].projected_points).toBeGreaterThanOrEqual(result[i].projected_points);
        }
    });

    test('should set penalty to zero for all teams when WILDCARD_CHIP is active', () => {
        const WILDCARD_CHIP = 'WILDCARD';
        const mockCurrentTeamWithFewTransfers = {
            ...mockCurrentTeam,
            freeTransfers: 1
        };
        const mockJsonDataWithFewTransfers = {
            ...mockJsonData,
            CurrentTeam: mockCurrentTeamWithFewTransfers
        };
        const result = calculateBestTeams(mockJsonDataWithFewTransfers, WILDCARD_CHIP);
        // All teams should have zero penalty since transfers_needed can't exceed 7 with WILDCARD_CHIP
        result.forEach(team => {
            expect(team.penalty).toBe(0);
        });
    });

    test('calculateChangesToTeam should not activate chip if transfers_needed <= freeTransfers', () => {
        const WILDCARD_CHIP = 'WILDCARD';
        const currentTeam = {
            drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
            constructors: ['RED', 'MER'],
            drsBoost: 'VER',
            freeTransfers: 3
        };
        const targetTeam = {
            drivers: ['VER', 'HAM', 'PER', 'SAI', 'NOR'],
            constructors: ['RED', 'FER'],
            drs_driver: 'HAM',
            transfers_needed: 2 // less than freeTransfers
        };
        const result = calculateChangesToTeam(currentTeam, targetTeam, WILDCARD_CHIP);
        expect(result.chipToActivate).toBeUndefined();
    });

    test('should handle empty drivers and constructors gracefully', () => {
        const emptyJsonData = {
            Drivers: [],
            Constructors: [],
            CurrentTeam: {
                drivers: [],
                constructors: [],
                drsBoost: '',
                freeTransfers: 2,
                costCapRemaining: 100
            }
        };
        const result = calculateBestTeams(emptyJsonData);
        expect(result).toEqual([]);
    });

    describe('calculateChangesToTeam', () => {

        test('should correctly identify drivers and constructors to add/remove', () => {
            const currentTeam = {
                drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
                constructors: ['RED', 'MER'],
                drsBoost: 'VER'
            };

            const targetTeam = {
                drivers: ['VER', 'HAM', 'PER', 'SAI', 'NOR'],
                constructors: ['RED', 'FER'],
                drs_driver: 'HAM'
            };

            const result = calculateChangesToTeam(currentTeam, targetTeam);

            expect(result.driversToAdd).toEqual(['NOR']);
            expect(result.driversToRemove).toEqual(['LEC']);
            expect(result.constructorsToAdd).toEqual(['FER']);
            expect(result.constructorsToRemove).toEqual(['MER']);
            expect(result.newDRS).toBe('HAM');
        });

        test('should return empty arrays when no changes needed', () => {
            const currentTeam = {
                drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
                constructors: ['RED', 'MER'],
                drsBoost: 'VER'
            };

            const targetTeam = {
                drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
                constructors: ['RED', 'MER'],
                drs_driver: 'VER'
            };

            const result = calculateChangesToTeam(currentTeam, targetTeam);

            expect(result.driversToAdd).toEqual([]);
            expect(result.driversToRemove).toEqual([]);
            expect(result.constructorsToAdd).toEqual([]);
            expect(result.constructorsToRemove).toEqual([]);
            expect(result.newDRS).toBeUndefined();
        });

        test('calculateChangesToTeam should activate WILDCARD_CHIP if needed', () => {
            const WILDCARD_CHIP = 'WILDCARD';
            const currentTeam = {
                drivers: ['VER', 'HAM', 'PER', 'SAI', 'LEC'],
                constructors: ['RED', 'MER'],
                drsBoost: 'VER',
                freeTransfers: 2
            };
            const targetTeam = {
                drivers: ['VER', 'HAM', 'PER', 'SAI', 'NOR'],
                constructors: ['RED', 'FER'],
                drs_driver: 'HAM',
                transfers_needed: 3 // more than freeTransfers
            };
            const result = calculateChangesToTeam(currentTeam, targetTeam, WILDCARD_CHIP);
            expect(result.chipToActivate).toBe(WILDCARD_CHIP);
        });
    });
});