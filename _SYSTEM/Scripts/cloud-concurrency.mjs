#!/usr/bin/env node
//
// cloud-concurrency.mjs — cross-process admission for cloud LLM lanes (z.ai GLM + ollama-cloud).
//
// Mirrors local-concurrency.mjs: a counting semaphore of named slot dirs so parallel glm-fleet /
// ollama-fleet / ad-hoc llm-lane sessions cannot jointly exceed plan concurrency ceilings.
//
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SLOTS_ROOT = process.env.YURI_CLOUD_SLOTS_DIR || path.join(REPO_ROOT, '_SYSTEM/state/cloud-slots');
const LEASE_STALE_MS = Number(process.env.YURI_CLOUD_LEASE_STALE_MS) || 60 * 60 * 1000;
const HOST = os.hostname();

const POOL_DEFAULTS = Object.freeze({
  glm: 3,
  'ollama-cloud': 5,  // operator-raised 2026-07-05 (was Pro-plan-default 3 — a false cap); self-limit 5
});

/** Map llm-lane key / provider to a cloud slot pool id. */
export function poolForLane(lane = '', provider = '') {
  const p = String(provider || '').toLowerCase();
  if (p === 'ollama-cloud' || String(lane).includes('ollama')) return 'ollama-cloud';
  return 'glm';
}

export function maxCloudConcurrency(pool = 'glm') {
  const envKey = `YURI_CLOUD_MAX_${String(pool).toUpperCase().replace(/-/g, '_')}`;
  const env = Number(process.env[envKey]);
  if (Number.isFinite(env) && env > 0) return Math.floor(env);
  const global = Number(process.env.YURI_CLOUD_MAX_CONCURRENCY);
  if (Number.isFinite(global) && global > 0) return Math.floor(global);
  return POOL_DEFAULTS[pool] ?? 3;
}

function slotsDir(pool) {
  return path.join(SLOTS_ROOT, String(pool || 'glm'));
}

function holderAlive(meta) {
  if (!meta || typeof meta.started !== 'number') return false;
  const fresh = Date.now() - meta.started < LEASE_STALE_MS;
  if (meta.host === HOST && Number.isInteger(meta.pid)) {
    try { process.kill(meta.pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
  }
  return fresh;
}

function readSlot(slotPath) {
  try { return JSON.parse(fs.readFileSync(path.join(slotPath, 'meta.json'), 'utf8')); } catch { return null; }
}

function prune(pool, max) {
  const dir = slotsDir(pool);
  fs.mkdirSync(dir, { recursive: true });
  const live = [];
  for (let i = 0; i < Math.max(max, 64); i += 1) {
    const slotPath = path.join(dir, `slot-${i}`);
    if (!fs.existsSync(slotPath)) continue;
    const meta = readSlot(slotPath);
    if (holderAlive(meta)) live.push({ slot: i, ...meta });
    else { try { fs.rmSync(slotPath, { recursive: true, force: true }); } catch { /* */ } }
  }
  return live;
}

export function cloudConcurrency(pool = 'glm') {
  const max = maxCloudConcurrency(pool);
  const live = prune(pool, max);
  return { pool, host: HOST, active: live.length, max, available: Math.max(0, max - live.length), slots: live };
}

export function tryAcquireCloudSlot({ lane = 'cloud', model = '', provider = '' } = {}) {
  const pool = poolForLane(lane, provider);
  const max = maxCloudConcurrency(pool);
  const dir = slotsDir(pool);
  prune(pool, max);
  for (let i = 0; i < max; i += 1) {
    const slotPath = path.join(dir, `slot-${i}`);
    try {
      fs.mkdirSync(slotPath);
    } catch (e) {
      if (e.code === 'EEXIST') {
        const meta = readSlot(slotPath);
        if (!holderAlive(meta)) {
          try { fs.rmSync(slotPath, { recursive: true, force: true }); fs.mkdirSync(slotPath); } catch { continue; }
        } else { continue; }
      } else { continue; }
    }
    const meta = { pid: process.pid, host: HOST, lane, model, pool, started: Date.now() };
    try { fs.writeFileSync(path.join(slotPath, 'meta.json'), JSON.stringify(meta)); } catch { /* */ }
    const active = prune(pool, max).length;
    return { ok: true, slotId: `${pool}/slot-${i}`, pool, active, max };
  }
  return { ok: false, pool, active: max, max };
}

export function releaseCloudSlot(slotId) {
  if (!slotId) return false;
  const parts = String(slotId).split('/');
  const pool = parts.length > 1 ? parts[0] : 'glm';
  const slot = parts.length > 1 ? parts[1] : parts[0];
  try { fs.rmSync(path.join(slotsDir(pool), slot), { recursive: true, force: true }); return true; } catch { return false; }
}

if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2] || 'status';
  const pool = process.argv[3] || 'glm';
  if (cmd === 'json') process.stdout.write(`${JSON.stringify(cloudConcurrency(pool), null, 2)}\n`);
  else if (cmd === 'reset') { fs.rmSync(slotsDir(pool), { recursive: true, force: true }); console.log(`cloud slots reset: ${pool}`); }
  else {
    const c = cloudConcurrency(pool);
    console.log(`CLOUD CONCURRENCY [${c.pool}] @ ${c.host}: ${c.active}/${c.max} active, ${c.available} free`);
    for (const s of c.slots) console.log(`  ${s.slot}: lane=${s.lane} model=${String(s.model).split('/').pop()} pid=${s.pid}`);
  }
}
