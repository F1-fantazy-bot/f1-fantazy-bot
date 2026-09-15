const { TableClient } = require('@azure/data-tables');

// CAS applies to the entire workflow, including its execution claim. Large
// payloads are split below the Azure Table UTF-16 property limit.
function encode(value) {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json, 'utf16le') > 800000) {
    throw new Error('Workflow too large');
  }
  const result = {};
  let index = 0;
  let offset = 0;
  while (offset < json.length) {
    let end = Math.min(offset + 15000, json.length);
    const last = json.charCodeAt(end - 1);
    if (end < json.length && last >= 0xd800 && last <= 0xdbff) {
      end -= 1;
    }
    result[`data${index++}`] = json.slice(offset, end);
    offset = end;
  }
  result.parts = index;

  return result;
}
function decode(entity) {
  if (!entity) {
    return null;
  }

  return {
    ...JSON.parse(
      Array.from({ length: entity.parts }, (_, i) => entity[`data${i}`]).join(
        '',
      ),
    ),
    etag: entity.etag,
  };
}
function createStore(client) {
  let ready;
  async function table() {
    if (!client) {
      client = TableClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING,
        'AgentWorkflows',
      );
    }
    if (!ready) {
      ready = client.createTable().catch((error) => {
        if (error.statusCode !== 409) {
          ready = undefined;
          throw error;
        }
      });
    }
    await ready;

    return client;
  }
  async function read(owner, id) {
    try {
      return decode(await (await table()).getEntity(String(owner), id));
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
  async function save(owner, value, create = false) {
    const { etag, ...data } = value;
    const entity = {
      partitionKey: String(owner),
      rowKey: value.id,
      expiresAt: value.expiresAt || '',
      ...encode(data),
    };
    try {
      if (create) {
        await (await table()).createEntity(entity);
      } else {
        await (await table()).updateEntity(entity, 'Replace', { etag });
      }
    } catch (error) {
      if ([409, 412, 404].includes(error.statusCode)) {
        return false;
      }
      throw error;
    }

    return true;
  }
  async function list(owner) {
    const result = [];
    // Identity is a server-resolved finite numeric chat ID.
    for await (const entity of (await table()).listEntities({
      queryOptions: { filter: `PartitionKey eq '${Number(owner)}'` },
    })) {
      if (entity.rowKey === 'lease') {
        continue;
      }
      if (entity.rowKey.includes(':receipt:')) {
        if (Date.parse(entity.expiresAt) <= Date.now()) {
          await client
            .deleteEntity(entity.partitionKey, entity.rowKey, {
              etag: entity.etag,
            })
            .catch(() => {});
        }
        continue;
      }
      if (Date.parse(entity.expiresAt) <= Date.now()) {
        await release(owner, entity.rowKey);
        await client
          .deleteEntity(entity.partitionKey, entity.rowKey, {
            etag: entity.etag,
          })
          .catch(() => {});
      } else {
        result.push(decode(entity));
      }
    }

    return result;
  }
  async function acquire(owner, id) {
    const lease = await read(owner, 'lease');
    if (lease?.workflowId === id) {
      return true;
    }
    if (lease) {
      const held = await read(owner, lease.workflowId);
      if (held && Date.parse(held.expiresAt) <= Date.now()) {
        await release(owner, lease.workflowId);

        return save(owner, { id: 'lease', workflowId: id }, true);
      }

      return false;
    }

    return save(owner, { id: 'lease', workflowId: id }, true);
  }
  async function release(owner, id) {
    const lease = await read(owner, 'lease');
    if (lease?.workflowId !== id) {
      return;
    }
    await (
      await table()
    )
      .deleteEntity(String(owner), 'lease', { etag: lease.etag })
      .catch((error) => {
        if (![404, 412].includes(error.statusCode)) {
          throw error;
        }
      });
  }

  return {
    read,
    save,
    list,
    acquire,
    release,
    putReceipt: (owner, flow, step) =>
      save(
        owner,
        {
          id: `${flow.id}:receipt:${step.claimId}`,
          expiresAt: flow.expiresAt,
          flow,
        },
        true,
      ),
    getReceipt: (owner, flow, step) =>
      read(owner, `${flow.id}:receipt:${step.claimId}`),
  };
}
module.exports = { createStore, encode, decode };
