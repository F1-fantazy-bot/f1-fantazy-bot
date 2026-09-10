const mockEntities = new Map();
let mockVersion = 'v1';
let mockRemoved = false;
const mockStore = {
  createTable: jest.fn(async () => {}),
  submitTransaction: jest.fn(async (operations) => operations.forEach(([, item]) => mockEntities.set(`${item.partitionKey}/${item.rowKey}`, item))),
  getEntity: jest.fn(async (partition, row) => { const item = mockEntities.get(`${partition}/${row}`); if (!item) {throw { statusCode: 404 };}

 return item; }),
  listEntities: jest.fn(async function* () {}),
  deleteEntity: jest.fn(),
};
jest.mock('@azure/data-tables', () => ({ TableClient: { fromConnectionString: () => mockStore } }));
jest.mock('@azure/storage-blob', () => ({ BlobServiceClient: { fromConnectionString: () => ({ getContainerClient: () => ({ getBlockBlobClient: () => ({ getProperties: async () => ({ etag: mockVersion }) }) }) }) } }));
jest.mock('../userRegistryService', () => ({ getUserById: jest.fn(async () => ({ userResetEpoch: 0 })) }));
jest.mock('../azureStorageService', () => ({
  getFantasyData: jest.fn(async () => ({ Drivers: [{ DR: 'A', price: 10, expectedPoints: 10, expectedPriceChange: 0 }], Constructors: [{ CN: 'X', price: 10, expectedPoints: 10, expectedPriceChange: 0 }] })),
  getPricesData: jest.fn(async () => ({ drivers: [], constructors: [] })),
  getNextRaceInfoData: jest.fn(async () => ({ race: 'Monza' })),
  getUserTeam: jest.fn(async () => mockRemoved ? null : ({ drivers: ['A'], constructors: ['X'], boost: 'A', costCapRemaining: 10, freeTransfers: 1 })),
}));
const cache = require('../cache');
const service = require('./bestTeamSnapshotService');
let result;
beforeEach(async () => {
  mockEntities.clear(); mockVersion = 'v1'; mockRemoved = false;
  cache.currentTeamCache[42] = { T1: { teamName: 'First' }, T2: { teamName: 'Second' } };
  cache.remainingRaceCountCache[cache.sharedKey] = 10;
  const context = await service.loadCalculationContext(42, 'T1');
  result = { teamId: 'T1', teamName: 'First', calculationData: { CurrentTeam: context.currentTeam, Drivers: context.drivers, Constructors: context.constructors },
    budgetChangePointsPerMillion: 0, bestTeams: [1, 2].map((row) => ({ row, drivers: ['A'], constructors: ['X'], boost_driver: 'A', projected_points: row * 30, expected_price_change: 0, transfers_needed: 0, penalty: 0, total_price: 20 })) };
});
async function save() { return service.saveCalculation(42, result, { mustIncludeDrivers: ['A'], rankBy: 'points' }, await service.dependencies(42, 'T1')); }
test('exact rows survive multiple calculations and active-team switches', async () => {
  const first = await save();
  result.bestTeams.reverse();
  await save();
  cache.userCache[42] = { selectedTeam: 'T2' };
  expect(await service.getChanges(42, first, 2)).toMatchObject({ status: 'ok', row: 2, projectedPoints: 60, teamName: 'First' });
  expect((await service.getChanges(42, first, 1)).projectedPoints).toBe(30);
});
test('another service instance reads the durable snapshot', async () => {
  const id = await save();
  await jest.isolateModulesAsync(async () => {
  const otherCache = require('../cache');
  otherCache.currentTeamCache[42] = { T1: { teamName: 'First' } };
  otherCache.remainingRaceCountCache[otherCache.sharedKey] = 10;
  expect((await require('./bestTeamSnapshotService').getChanges(42, id, 1)).status).toBe('ok');
  });
});
test('unauthorized references and removed teams do not disclose data', async () => {
  const id = await save();
  expect(await service.getChanges(99, id, 1)).toEqual({ status: 'missing_result' });
  mockRemoved = true;
  expect(await service.getChanges(42, id, 1)).toEqual({ status: 'missing_result' });
});
test.each([0, -1, 1.5, 3, undefined])('invalid row %s returns available rows', async (row) => {
  expect(await service.getChanges(42, await save(), row)).toMatchObject({ status: 'invalid_selection', rows: [1, 2] });
});
test('changed inputs on another server preserve the authorized recalculation request', async () => {
  const id = await save(); mockVersion = 'v2';
  require('../azureStorageService').getUserTeam.mockResolvedValueOnce({ ...result.calculationData.CurrentTeam, freeTransfers: 0 });
  expect(await service.getChanges(42, id, 1)).toMatchObject({ status: 'outdated_result', request: { teamId: 'T1', mustIncludeDrivers: ['A'], rankBy: 'points' } });
});
test('expired results require a new selection', async () => {
  const id = await save();
  for (const entity of mockEntities.values()) {entity.expiresAt = new Date(0).toISOString();}
  expect((await service.getChanges(42, id, 1)).status).toBe('outdated_result');
});
test('storage failure rejects the calculation', async () => {
  mockStore.submitTransaction.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(save()).rejects.toThrow('storage unavailable');
});

test('expiry filters use quoted ISO strings supported by Azure Table Storage', async () => {
  await save();
  const filter = mockStore.listEntities.mock.calls.at(-2)[0].queryOptions.filter;
  expect(filter).toMatch(/expiresAt ge '\d{4}-\d{2}-\d{2}T/);
  expect([...mockEntities.values()][0].expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test.each([
  { userResetEpoch: 1 },
  { selectedChipByTeam: JSON.stringify({ T1: 'EXTRA_BOOST' }) },
  { bestTeamBudgetChangePointsPerMillion: JSON.stringify({ T1: 2 }) },
])('fresh durable preferences invalidate an existing result: %j', async (user) => {
  const id = await save();
  const registry = require('../userRegistryService');
  registry.getUserById.mockResolvedValueOnce(user);
  expect((await require('./bestTeamSnapshotService').getChanges(42, id, 1)).status).toBe('outdated_result');
  registry.getUserById.mockReset().mockResolvedValue({ userResetEpoch: 0 });
});

test('effective projection changes invalidate details even with unchanged source versions', async () => {
  const id = await save();
  const source = require('../azureStorageService');
  const data = await source.getFantasyData();
  source.getFantasyData.mockResolvedValueOnce({ ...data, Drivers: data.Drivers.map((driver) => ({ ...driver, expectedPoints: 99 })) });
  expect((await service.getChanges(42, id, 1)).status).toBe('outdated_result');
});

test('reading details performs no snapshot or user-data writes', async () => {
  const id = await save();
  mockStore.submitTransaction.mockClear();
  mockStore.deleteEntity.mockClear();
  const before = JSON.stringify(cache.currentTeamCache[42]);
  await service.getChanges(42, id, 1);
  expect(mockStore.submitTransaction).not.toHaveBeenCalled();
  expect(mockStore.deleteEntity).not.toHaveBeenCalled();
  expect(JSON.stringify(cache.currentTeamCache[42])).toBe(before);
});

test('first selection survives a cold-start rewrite of identical source blobs', async () => {
  const id = await save();
  // Another function instance refreshes the same league roster on startup.
  mockVersion = 'rewritten-on-startup';
  await jest.isolateModulesAsync(async () => {
    const otherCache = require('../cache');
    otherCache.currentTeamCache[42] = { T1: { teamName: 'First' } };
    otherCache.remainingRaceCountCache[otherCache.sharedKey] = 10;
    const otherService = require('./bestTeamSnapshotService');
    expect(await otherService.getChanges(42, id, 1)).toMatchObject({
      status: 'ok', row: 1, projectedPoints: 30,
    });
  });
});

test('source changes during the read still reject inconsistent inputs', async () => {
  const source = require('../azureStorageService');
  const data = await source.getFantasyData();
  source.getFantasyData.mockImplementationOnce(async () => {
    mockVersion = 'changed-during-read';

    return data;
  });
  await expect(service.loadCalculationContext(42, 'T1')).rejects.toThrow('Inputs changed during calculation');
});
