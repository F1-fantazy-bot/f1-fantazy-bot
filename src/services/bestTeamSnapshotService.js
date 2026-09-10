const { randomUUID, createHash } = require('crypto');
const { TableClient } = require('@azure/data-tables');
const { BlobServiceClient } = require('@azure/storage-blob');
const cache = require('../cache');
const { getUserById } = require('../userRegistryService');
const storage = require('../azureStorageService');
const { applyPrices } = require('../priceData');
const { buildBestTeamChanges } = require('../cores/bestTeamChangesCore');
const TTL = 24 * 60 * 60 * 1000;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let client;
async function table() {
  if (!client) {
    const candidate = TableClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING, 'BestTeamCalculations');
    await candidate.createTable().catch((error) => { if (error.statusCode !== 409) {throw error;} });
    client = candidate;
  }

  return client;
}
function inputs(chatId, teamId) {
  return {
    drivers: cache.getDriversForChat(chatId), constructors: cache.getConstructorsForChat(chatId),
    currentTeam: cache.currentTeamCache[chatId]?.[teamId], driverEntries: cache.pricesCache.driverEntries,
    nextRaceInfo: cache.nextRaceInfoCache[cache.sharedKey],
    chip: cache.selectedChipCache[chatId]?.[teamId] || null,
    ppm: cache.getBestTeamBudgetChangePointsPerMillion(chatId, teamId),
    remainingRaceCount: cache.remainingRaceCountCache[cache.sharedKey],
  };
}
async function sourceVersions(chatId, teamId) {
  const container = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING)
    .getContainerClient(process.env.AZURE_STORAGE_CONTAINER_NAME);
  const names = ['f1-fantasy-data.json', 'prices.json', 'next-race-info.json', `user-teams/${chatId}_${teamId}.json`];

  return Promise.all(names.map(async (name) => {
    try { return (await container.getBlockBlobClient(name).getProperties()).etag; }
    catch (error) { if (error.statusCode === 404) {return null;} throw error; }
  }));
}
async function loadCalculationContext(chatId, teamId) {
  const before = await sourceVersions(chatId, teamId);
  const [fantasy, prices, nextRaceInfo, currentTeam, user] = await Promise.all([
    storage.getFantasyData(), storage.getPricesData(), storage.getNextRaceInfoData(),
    storage.getUserTeam(chatId, teamId), getUserById(chatId),
  ]);
  if (!currentTeam || !before[3]) {return { status: 'missing_result' };}
  const after = await sourceVersions(chatId, teamId);
  if (hash(before) !== hash(after)) {throw new Error('Inputs changed during calculation; retry');}
  const priced = applyPrices({
    drivers: cache.driversCache[chatId] || Object.fromEntries(fantasy.Drivers.map((item) => [item.DR, item])),
    constructors: cache.constructorsCache[chatId] || Object.fromEntries(fantasy.Constructors.map((item) => [item.CN, item])),
  }, prices);
  const context = { ...inputs(chatId, teamId), currentTeam, nextRaceInfo,
    drivers: priced.drivers,
    constructors: priced.constructors,
    driverEntries: prices.drivers,
    ppm: cache.normalizeBestTeamBudgetChangePointsPerMillion(user?.bestTeamBudgetChangePointsPerMillion)[teamId] || 0,
    chip: cache.normalizeSelectedChipByTeam(user?.selectedChipByTeam)[teamId] || null,
  };

  return { ...context, fingerprint: hash({ context, versions: after, reset: user?.userResetEpoch,
    ranking: user?.bestTeamBudgetChangePointsPerMillion, chips: user?.selectedChipByTeam }) };
}
async function dependencies(chatId, teamId) {
  return (await loadCalculationContext(chatId, teamId)).fingerprint;
}
async function saveCalculation(chatId, result, request, fingerprint) {
  const store = await table();
  const partitionKey = hash(String(chatId));
  let activeRows = 0;
  for await (const entity of store.listEntities({ queryOptions: { filter: `PartitionKey eq '${partitionKey}' and expiresAt ge '${new Date().toISOString()}'`, select: ['rowKey'] } })) {
    if (!entity.rowKey.includes('_') && ++activeRows >= 20) {throw new Error('Calculation limit reached; retry later');}
  }
  const calculationId = randomUUID();
  const expiresAt = new Date(Date.now() + TTL).toISOString();
  if (!result.calculationData || !fingerprint) {
    throw new Error('Calculation inputs unavailable');
  }
  const rows = result.bestTeams.slice(0, 10).map((target) => ({ row: target.row,
    details: buildBestTeamChanges({ calculationData: result.calculationData, target,
      chip: result.chip, ppm: result.budgetChangePointsPerMillion, remainingRaceCount: result.remainingRaceCount || 0 }) }));
  const metadata = { teamId: result.teamId, teamName: result.teamName, request: { ...request, teamId: result.teamId, teamName: undefined },
    calculationData: result.calculationData, chip: result.chip, ppm: result.budgetChangePointsPerMillion, remainingRaceCount: result.remainingRaceCount,
    fingerprint, rows: rows.map((item) => item.row) };
  const entities = [{ rowKey: calculationId, payload: JSON.stringify(metadata) },
    ...rows.map((item) => ({ rowKey: `${calculationId}_${item.row}`, payload: JSON.stringify(item.details) }))];
  if (entities.some((entity) => Buffer.byteLength(entity.payload, 'utf16le') > 60000)) {throw new Error('Snapshot too large');}
  await store.submitTransaction(entities.map((entity) => ['create', { partitionKey, ...entity, expiresAt }]));
  // Bounded best-effort cleanup; each row has its own expiry.
  try {
    let count = 0;
    for await (const entity of store.listEntities({ queryOptions: { filter: `PartitionKey eq '${partitionKey}' and expiresAt lt '${new Date().toISOString()}'` } })) {
      await store.deleteEntity(partitionKey, entity.rowKey);
      if (++count >= 110) {break;}
    }
  } catch { /* Expiry is enforced on reads even when cleanup fails. */ }

  return calculationId;
}
async function getChanges(chatId, calculationId, row) {
  if (!/^[a-f0-9-]{36}$/.test(calculationId || '')) {return { status: 'missing_result' };}
  const store = await table();
  const partition = hash(String(chatId));
  let entity;
  try { entity = await store.getEntity(partition, calculationId); }
  catch (error) { if (error.statusCode === 404) {return { status: 'missing_result' };} throw error; }
  const meta = JSON.parse(entity.payload);
  if (!cache.getUserTeamIds(chatId).includes(meta.teamId)) {return { status: 'missing_result' };}
  const base = { calculationId, teamName: meta.teamName, request: meta.request };
  const currentFingerprint = await dependencies(chatId, meta.teamId);
  if (!currentFingerprint) {return { status: 'missing_result' };}
  if (Date.parse(entity.expiresAt) <= Date.now() || meta.fingerprint !== currentFingerprint) {return { ...base, status: 'outdated_result' };}
  if (!Number.isInteger(row) || row < 1 || !meta.rows.includes(row)) {return { ...base, status: 'invalid_selection', rows: meta.rows };}
  const detail = await store.getEntity(partition, `${calculationId}_${row}`);

  return { status: 'ok', ...base, row, ...JSON.parse(detail.payload) };
}
module.exports = { loadCalculationContext, dependencies, saveCalculation, getChanges };
