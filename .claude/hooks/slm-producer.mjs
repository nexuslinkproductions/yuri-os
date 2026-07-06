#!/usr/bin/env node
//
// slm-producer.mjs — Stop + SessionStart PRODUCER hook for the autonomous local-SLM worker.
//
// ENQUEUE-ONLY: the hook never calls a model itself. It appends a bounded job to the worker queue;
// processing happens ONLY via the governed llm lane (yuri-slm-worker drains it through qwen-local,
// organ-gated + concurrency-governed). "only via the llm."
//
// Gated by the flag file _SYSTEM/state/slm-producers.enabled (dual-arm style — absent => no-op, so
// producers ship OFF and persist across sessions deterministically). Stop is throttled (>=180s gap)
// so it can't flood the queue per-turn. Reads only NON-protected surfaces. Fail-safe: any error is
// swallowed and the hook exits 0 — it must never break a turn or session start.
//
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = path.join(ROOT, '_SYSTEM/state');
const ENABLE = path.join(STATE, 'slm-producers.enabled');
const WORKER = path.join(ROOT, '_SYSTEM/Scripts/yuri-slm-worker.mjs');
const event = String(process.argv[2] || '').toLowerCase();

try {
  try { fs.readFileSync(0); } catch { /* drain hook stdin JSON; we don't need it */ }
  if (!fs.existsSync(ENABLE)) process.exit(0);               // gated OFF → no-op

  if (event === 'stop') {
    const ts = path.join(STATE, 'slm-producer-stop.ts');
    const now = Date.now();
    let last = 0; try { last = Number(fs.readFileSync(ts, 'utf8')) || 0; } catch { /* first run */ }
    if (now - last < 180000) process.exit(0);                // throttle: at most one Stop job / 180s
    try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(ts, String(now)); } catch { /* */ }
    // Ambient enrichment: tag the most recently written research/report artifact (non-protected).
    let newest = null, mt = 0;
    for (const d of ['02_RESOURCES/research', '_SYSTEM/reports'].map((x) => path.join(ROOT, x))) {
      try { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isFile() && s.mtimeMs > mt) { mt = s.mtimeMs; newest = p; } } } catch { /* dir absent */ }
    }
    if (!newest) process.exit(0);
    const body = fs.readFileSync(newest, 'utf8').slice(0, 800);
    enqueue('tag', `Tag this artifact (${path.basename(newest)}) with 3-6 topic tags: ${body}`);
  } else {
    // SessionStart: one orientation job — surface the threads worth resurfacing (memory index is non-protected).
    let idx = ''; try { idx = fs.readFileSync(path.join(ROOT, '.claude/memory/MEMORY.md'), 'utf8').slice(0, 1500); } catch { /* */ }
    if (idx) enqueue('triage', `From this YURI memory index, name the 3 threads most worth resurfacing now (terse): ${idx}`);
  }
} catch { /* never break the turn */ }
process.exit(0);

function enqueue(type, payload) {
  try { execFileSync('node', [WORKER, 'enqueue', '--type', type, '--payload', payload.slice(0, 7000)], { stdio: 'ignore', timeout: 8000 }); } catch { /* worker caps/backpressure may refuse — fine */ }
}
