#!/usr/bin/env node
//
// local-concurrency.mjs — global admission control for LOCAL model inference.
//
// THE PROBLEM: many main lanes (Claude / Mimo / Codex sessions) across one or more machines can each
// want to fire a local SLM. Local inference is GPU/RAM-bound — too many concurrent local agents on one
// box thrashes VRAM and crashes/30x-slows everything (observed live: 2 concurrent 12B → VRAM blowup →
// CPU spill). So EVERY local dispatch must first check "how many local agents are running?" against a
// per-machine threshold, and only proceed if under it. This is that semaphore.
//
// DESIGN: a counting semaphore of N NAMED slot dirs (slot-0..slot-{N-1}). Acquire = atomic mkdir of the
// first free slot (mkdir is atomic on POSIX/APFS — fails EEXIST if taken, so NO check-then-act race).
// Each slot holds meta {pid, host, lane, model, started}. Release = rmdir. Crashed holders are reclaimed
// (dead pid on same host, or stale past LEASE_STALE_MS). Put SLOTS_DIR on a shared FS and the same
// mkdir-atomicity coordinates ACROSS machines; on a local FS it governs this machine.
//
// THRESHOLD (per machine — set to the box's real capacity): env YURI_LOCAL_MAX_CONCURRENCY, else
// models.json local.max_concurrency, else 1 (the safe sequential default).
//
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SLOTS_DIR = process.env.YURI_LOCAL_SLOTS_DIR || path.join(REPO_ROOT, '_SYSTEM/state/local-slots');
const LEASE_STALE_MS = Number(process.env.YURI_LOCAL_LEASE_STALE_MS) || 20 * 60 * 1000;
const HOST = os.hostname();

export function maxConcurrency() {
  const env = Number(process.env.YURI_LOCAL_MAX_CONCURRENCY);
  if (Number.isFinite(env) && env > 0) return Math.floor(env);
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude/config/models.json'), 'utf8'));
    const m = Number(cfg?.local?.max_concurrency);
    if (Number.isFinite(m) && m > 0) return Math.floor(m);
  } catch { /* fall through */ }
  return 1; // safe default: strictly sequential (matches the gemma-lanes-strictly-sequential lock)
}

// A holder is alive if: same host AND pid responds to signal 0; OR (different host AND not stale).
// Remote pids can't be probed, so cross-machine reclamation is staleness-only.
function holderAlive(meta) {
  if (!meta || typeof meta.started !== 'number') return false;
  const fresh = Date.now() - meta.started < LEASE_STALE_MS;
  if (meta.host === HOST && Number.isInteger(meta.pid)) {
    try { process.kill(meta.pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } // EPERM = exists, not ours
  }
  return fresh;
}

function readSlot(slotPath) {
  try { return JSON.parse(fs.readFileSync(path.join(slotPath, 'meta.json'), 'utf8')); } catch { return null; }
}

// Prune dead/stale slots so a crashed holder never wedges capacity. Returns live slot metas.
function prune(max) {
  fs.mkdirSync(SLOTS_DIR, { recursive: true });
  const live = [];
  for (let i = 0; i < Math.max(max, 64); i += 1) {            // sweep a generous range in case max shrank
    const slotPath = path.join(SLOTS_DIR, `slot-${i}`);
    if (!fs.existsSync(slotPath)) continue;
    const meta = readSlot(slotPath);
    if (holderAlive(meta)) live.push({ slot: i, ...meta });
    else { try { fs.rmSync(slotPath, { recursive: true, force: true }); } catch { /* race: another reclaimer won */ } }
  }
  return live;
}

export function localConcurrency() {
  const max = maxConcurrency();
  const live = prune(max);
  return { host: HOST, active: live.length, max, available: Math.max(0, max - live.length), slots: live };
}

// Atomically take the first free slot < max. Returns {ok:true, slotId, active, max} or {ok:false, active, max}.
export function tryAcquireLocalSlot({ lane = 'local', model = '' } = {}) {
  const max = maxConcurrency();
  prune(max);
  for (let i = 0; i < max; i += 1) {
    const slotPath = path.join(SLOTS_DIR, `slot-${i}`);
    try {
      fs.mkdirSync(slotPath);                                  // ATOMIC: throws EEXIST if already held → no TOCTOU
    } catch (e) {
      if (e.code === 'EEXIST') {
        const meta = readSlot(slotPath);
        if (!holderAlive(meta)) {                              // dead holder → reclaim and retake this slot
          try { fs.rmSync(slotPath, { recursive: true, force: true }); fs.mkdirSync(slotPath); } catch { continue; }
        } else { continue; }
      } else { continue; }
    }
    const meta = { pid: process.pid, host: HOST, lane, model, started: Date.now() };
    try { fs.writeFileSync(path.join(slotPath, 'meta.json'), JSON.stringify(meta)); } catch { /* best effort */ }
    const active = prune(max).length;
    return { ok: true, slotId: `slot-${i}`, active, max };
  }
  return { ok: false, active: max, max };
}

export function releaseLocalSlot(slotId) {
  if (!slotId) return false;
  try { fs.rmSync(path.join(SLOTS_DIR, String(slotId)), { recursive: true, force: true }); return true; } catch { return false; }
}

// CLI: `node local-concurrency.mjs status|json|reset`
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2] || 'status';
  const c = localConcurrency();
  if (cmd === 'json') process.stdout.write(`${JSON.stringify(c, null, 2)}\n`);
  else if (cmd === 'reset') { fs.rmSync(SLOTS_DIR, { recursive: true, force: true }); console.log('local slots reset.'); }
  else {
    console.log(`LOCAL CONCURRENCY @ ${c.host}: ${c.active}/${c.max} active, ${c.available} free`);
    for (const s of c.slots) console.log(`  ${s.slot}: lane=${s.lane} model=${String(s.model).split('/').pop()} pid=${s.pid} host=${s.host}`);
  }
}
