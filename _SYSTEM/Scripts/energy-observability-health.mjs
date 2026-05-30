#!/usr/bin/env node
// Energy observability liveness probe for yuri-health.
// Confirms the everyday-workflow ΔU telemetry layer is WIRED (hook registered +
// core modules present) and reports whether records are accruing. Liveness is
// "wired", not "has data" — absence of records is reported, not failed, so a
// fresh checkout is healthy. Exit 0 = wired; 1 = a wiring link is broken.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (p) => path.join(REPO_ROOT, p);

function hookRegistered() {
  try {
    const settings = JSON.parse(fs.readFileSync(rel('.claude/settings.json'), 'utf8'));
    const post = (settings.hooks?.PostToolUse || []).flatMap((g) => g.hooks || []);
    return post.some((h) => String(h.command || '').includes('energy-tick'));
  } catch {
    return false;
  }
}

function coreWired() {
  return fs.existsSync(rel('.claude/hooks/energy-tick.mjs'))
    && fs.existsSync(rel('_SYSTEM/Scripts/energy-tick-core.mjs'))
    && fs.existsSync(rel('_SYSTEM/Scripts/math/yuri-energy-trace.mjs'));
}

function traceFileCount() {
  try {
    const dir = rel('_SYSTEM/state/energy-trace');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')).length : 0;
  } catch {
    return 0;
  }
}

const hook = hookRegistered();
const core = coreWired();
const records = traceFileCount();
const ok = hook && core;

const summary = {
  ok,
  hookRegistered: hook,
  coreWired: core,
  traceFiles: records,
  summary: `wired=${ok} hook=${hook} core=${core} traceFiles=${records}`,
};

console.log(JSON.stringify({ summary }, null, 2));
process.exit(ok ? 0 : 1);
