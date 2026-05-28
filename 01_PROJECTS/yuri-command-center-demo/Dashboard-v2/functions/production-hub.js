const { storageGet, storagePut, storageDelete } = require('./shared-storage');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const BUCKET = 'production-hub';

// Key helper — entity + id → storage key
function bkey(entity, id) { return `${entity}--${id}`; }

async function loadIndex(entity) {
  const data = await storageGet(BUCKET, bkey(entity, '_index'));
  return Array.isArray(data) ? data : [];
}

async function saveIndex(entity, ids) {
  const res = await storagePut(BUCKET, bkey(entity, '_index'), ids);
  console.log(`[hub] saveIndex ${entity}: ${ids.length} ids, status=${res.status}`);
}

async function loadRecord(entity, id) {
  return await storageGet(BUCKET, bkey(entity, id));
}

async function saveRecord(entity, id, data) {
  const res = await storagePut(BUCKET, bkey(entity, id), data);
  console.log(`[hub] saveRecord ${entity}/${id}: status=${res.status}`);
}

async function deleteRecord(entity, id) {
  await storageDelete(BUCKET, bkey(entity, id));
}

async function loadAll(entity) {
  const ids = await loadIndex(entity);
  const records = [];
  for (const id of ids) {
    const rec = await loadRecord(entity, id);
    if (rec) records.push(rec);
  }
  return records;
}

async function saveWithIndex(entity, id, data) {
  await saveRecord(entity, id, data);
  const ids = await loadIndex(entity);
  if (!ids.includes(id)) {
    ids.push(id);
    await saveIndex(entity, ids);
  }
}

async function deleteWithIndex(entity, id) {
  await deleteRecord(entity, id);
  const ids = await loadIndex(entity);
  await saveIndex(entity, ids.filter(i => i !== id));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  const ok = (data) => ({ statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(data) });
  const err = (msg, code = 400) => ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: msg }) });

  try {
    if (event.httpMethod === 'GET') {
      const entity = event.queryStringParameters?.entity;
      const id = event.queryStringParameters?.id;
      if (!entity) return err('Missing entity parameter');
      if (id) {
        const record = await loadRecord(entity, id);
        return ok(record || {});
      }
      return ok(await loadAll(entity));
    }

    if (event.httpMethod === 'POST') {
      const { action, data } = JSON.parse(event.body || '{}');
      if (!action) return err('Missing action');

      const parts = action.split('.');
      if (parts.length !== 2) return err('Invalid action format. Use entity.operation');
      const [entity, op] = parts;

      const validEntities = ['pipeline', 'meetings', 'clients', 'closures', 'client-board', 'client-kb'];
      if (!validEntities.includes(entity)) return err('Unknown entity. Supported: ' + validEntities.join(', '));

      switch (op) {
        case 'list': return ok(await loadAll(entity));
        case 'get': {
          if (!data?.id) return err('Missing id');
          return ok(await loadRecord(entity, data.id) || {});
        }
        case 'save': {
          if (!data?.id) return err('Missing id in data');
          data.updatedAt = new Date().toISOString();
          await saveWithIndex(entity, data.id, data);
          return ok({ ok: true, id: data.id });
        }
        case 'delete': {
          if (!data?.id) return err('Missing id');
          await deleteWithIndex(entity, data.id);
          return ok({ ok: true });
        }
        default:
          return err('Unknown operation: ' + op);
      }
    }

    return err('Method not allowed', 405);
  } catch (e) {
    return err('Server error: ' + e.message, 500);
  }
};
