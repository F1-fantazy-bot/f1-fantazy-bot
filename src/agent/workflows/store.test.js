const { createStore, encode, decode } = require('./store');
function clientFake() {
  const rows = new Map();
  let sequence = 0;

  return {
    createTable: jest.fn(async () => {}),
    createEntity: jest.fn(async (entity) => {
      const key = `${entity.partitionKey}/${entity.rowKey}`;
      if (rows.has(key)) {
        throw { statusCode: 409 };
      }
      rows.set(key, { ...entity, etag: String(++sequence) });
    }),
    getEntity: jest.fn(async (owner, id) => {
      const row = rows.get(`${owner}/${id}`);
      if (!row) {
        throw { statusCode: 404 };
      }

      return { ...row };
    }),
    updateEntity: jest.fn(async (entity, _mode, { etag }) => {
      const key = `${entity.partitionKey}/${entity.rowKey}`;
      const old = rows.get(key);
      if (old?.etag !== etag) {
        throw { statusCode: 412 };
      }
      rows.set(key, { ...entity, etag: String(++sequence) });
    }),
    deleteEntity: jest.fn(async (owner, id, { etag }) => {
      const key = `${owner}/${id}`;
      if (rows.get(key)?.etag !== etag) {
        throw { statusCode: 412 };
      }
      rows.delete(key);
    }),
    async *listEntities() {
      yield* rows.values();
    },
  };
}
test('UTF-16 safe chunks roundtrip Hebrew and large results', () => {
  const value = { text: 'תוצאה 🏁'.repeat(10000) };
  const entity = encode(value);
  expect(entity.parts).toBeGreaterThan(1);
  expect(decode(entity).text).toBe(value.text);
  expect(Buffer.byteLength(entity.data0, 'utf16le')).toBeLessThan(64000);
});
test('CAS across workers and durable per-owner lease', async () => {
  const client = clientFake();
  const first = createStore(client);
  const second = createStore(client);
  await first.save(42, { id: 'flow', revision: 1 }, true);
  const a = await first.read(42, 'flow');
  const b = await second.read(42, 'flow');
  expect(await first.save(42, { ...a, state: 'running' })).toBe(true);
  expect(await second.save(42, { ...b, state: 'running' })).toBe(false);
  expect(await first.acquire(42, 'flow')).toBe(true);
  expect(await second.acquire(42, 'other')).toBe(false);
  await first.release(42, 'other');
  expect(await second.acquire(42, 'other')).toBe(false);
  await first.release(42, 'flow');
  expect(await second.acquire(42, 'other')).toBe(true);
});
test('receipt persists across workers and is excluded from workflow list', async () => {
  const client = clientFake();
  const first = createStore(client);
  const second = createStore(client);
  const flow = {
    id: 'flow',
    owner: 42,
    steps: [],
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  const step = { claimId: 'claim' };
  await first.putReceipt(42, flow, step);
  expect((await second.getReceipt(42, flow, step)).flow.id).toBe('flow');
  expect(await second.list(42)).toEqual([]);
});
