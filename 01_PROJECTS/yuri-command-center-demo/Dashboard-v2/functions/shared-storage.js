// ═══ SHARED SUPABASE STORAGE HELPER ═══
// Replaces all Netlify Blobs calls across functions.
// Buckets: production-hub, telegram-state, daily-state
//
// Supabase Storage REST:
//   GET    /storage/v1/object/{bucket}/{key}        → download
//   POST   /storage/v1/object/{bucket}/{key}        → upload (x-upsert: true)
//   DELETE /storage/v1/object/{bucket}              → delete (body: {prefixes})

'use strict';

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// GET a JSON object from Supabase Storage. Returns parsed object or null.
async function storageGet(bucket, key) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return new Promise(resolve => {
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/${bucket}/${key}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(raw)); } catch { resolve(null); }
        } else {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

// GET raw string from Supabase Storage. Returns string or null.
async function storageGetRaw(bucket, key) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return new Promise(resolve => {
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/${bucket}/${key}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(res.statusCode === 200 ? raw : null));
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

// PUT (upsert) a JSON object into Supabase Storage.
async function storagePut(bucket, key, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { status: 503 };
  return new Promise(resolve => {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/${bucket}/${key}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', e => resolve({ status: 500, body: e.message }));
    req.write(body);
    req.end();
  });
}

// DELETE an object from Supabase Storage.
async function storageDelete(bucket, key) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { status: 503 };
  return new Promise(resolve => {
    const body = JSON.stringify({ prefixes: [key] });
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/${bucket}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', e => resolve({ status: 500, body: e.message }));
    req.write(body);
    req.end();
  });
}

module.exports = { storageGet, storageGetRaw, storagePut, storageDelete };
