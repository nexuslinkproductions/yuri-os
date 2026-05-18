#!/usr/bin/env node
// PATCH 038 — Pulse Cortex self-inspection
//
// `_SYSTEM/Scripts/ai cortex` invokes this to print the live cortex state:
//   - current pulse-bus.json findings (unconsumed, by severity)
//   - pulse-plan.json last turn classification
//   - pulse-codex-pending.json status
//   - pulse-beacon-state.json throttle counter
//   - OpenClaw gateway reachability
//   - pulse-errors.log tail (recent failures)
//
// Pure read-only; never mutates state. Output is human-friendly text
// (default) or --json for machine consumption.

import { promises as fsp, existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const PATHS = {
  bus:     path.join(STATE_DIR, 'pulse-bus.json'),
  plan:    path.join(STATE_DIR, 'pulse-plan.json'),
  pending: path.join(STATE_DIR, 'pulse-codex-pending.json'),
  beacon:  path.join(STATE_DIR, 'pulse-beacon-state.json'),
  errors:  path.join(STATE_DIR, 'pulse-errors.log'),
  hookTel: path.join(STATE_DIR, 'pulse-hook-telemetry.log'),
};

async function readJSON(p) {
  try { return JSON.parse(await fsp.readFile(p, 'utf8')); } catch { return null; }
}
async function readTail(p, bytes = 2000) {
  try {
    const buf = await fsp.readFile(p);
    return buf.slice(-bytes).toString('utf8');
  } catch { return ''; }
}

async function openclawHealth() {
  return new Promise((resolve) => {
    const child = spawn('openclaw', ['gateway', 'status'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let settled = false;
    const t = setTimeout(() => { if (!settled) { settled = true; try { child.kill(); } catch (_) {} resolve('timeout'); } }, 2000);
    child.stdout?.on('data', d => out += d.toString());
    child.on('error', () => { if (!settled) { settled = true; clearTimeout(t); resolve('not-installed'); } });
    child.on('close', (code) => { if (!settled) { settled = true; clearTimeout(t); resolve(code === 0 ? 'ok' : `exit=${code}`); } });
  });
}

async function collect() {
  const [bus, plan, pending, beacon, errorTail, hookTail, openclaw] = await Promise.all([
    readJSON(PATHS.bus),
    readJSON(PATHS.plan),
    readJSON(PATHS.pending),
    readJSON(PATHS.beacon),
    readTail(PATHS.errors, 1500),
    readTail(PATHS.hookTel, 1000),
    openclawHealth(),
  ]);

  const now = Date.now();
  const ring = bus?.ring || [];
  const unconsumed = ring.filter(e => !e.consumed && new Date(e.expires_at).getTime() > now);
  const counts = { INFO: 0, WARN: 0, HIGH: 0, CRITICAL: 0 };
  unconsumed.forEach(e => { counts[e.severity] = (counts[e.severity] || 0) + 1; });

  return {
    timestamp: new Date().toISOString(),
    plan: plan ? {
      turn_id: plan.turn_id,
      complexityTier: plan.plan?.complexityTier,
      ensemble: plan.plan?.ensemble,
      beaconLevel: plan.plan?.beaconLevel,
      codexPolicy: plan.plan?.codexPolicy,
      scenario: plan.plan?.scenario,
      lane: plan.plan?.lane,
    } : null,
    bus: {
      total_ring: ring.length,
      unconsumed: unconsumed.length,
      counts,
      last_5: unconsumed.slice(-5).map(e => ({
        ts: e.ts,
        source: e.source,
        severity: e.severity,
        runtime_kind: e.runtime_kind,
        finding: (e.finding || '').slice(0, 180),
        turn_id: e.turn_id,
      })),
    },
    codex_pending: pending ? {
      turn_id: pending.turn_id,
      status: pending.status,
      files_touched: pending.files_touched,
      stats: pending.stats,
      expires_at: pending.expires_at,
      expired: new Date(pending.expires_at).getTime() < now,
    } : null,
    beacon: beacon || { count: 0 },
    openclaw_gateway: openclaw,
    recent_errors: errorTail.split('\n').filter(Boolean).slice(-5),
    recent_hook_telemetry: hookTail.split('\n').filter(Boolean).slice(-5),
  };
}

function renderText(report) {
  const out = [];
  out.push(`⬢ PULSE CORTEX STATUS  (${report.timestamp})`);
  out.push('─'.repeat(72));
  if (report.plan) {
    out.push(`Last classification:`);
    out.push(`  turn=${report.plan.turn_id}  tier=${report.plan.complexityTier}  scenario=${report.plan.scenario}  lane=${report.plan.lane}`);
    out.push(`  ensemble=[${(report.plan.ensemble || []).join(', ')}]`);
    out.push(`  beacon=${report.plan.beaconLevel}  codex=${report.plan.codexPolicy}`);
  } else {
    out.push('Last classification: none');
  }
  out.push('');
  out.push(`Bus: ${report.bus.unconsumed}/${report.bus.total_ring} unconsumed  ` +
    `INFO=${report.bus.counts.INFO} WARN=${report.bus.counts.WARN} HIGH=${report.bus.counts.HIGH} CRITICAL=${report.bus.counts.CRITICAL}`);
  for (const f of report.bus.last_5) {
    out.push(`  • [${f.severity}] ${f.source} (${f.runtime_kind || 'unk'}) :: ${f.finding}`);
  }
  out.push('');
  if (report.codex_pending) {
    const p = report.codex_pending;
    out.push(`Codex pending: status=${p.status}  files=${(p.files_touched||[]).length}  ` +
      `stats=+${p.stats?.added || 0}/-${p.stats?.deleted || 0}  expired=${p.expired}`);
  } else {
    out.push('Codex pending: none');
  }
  out.push(`Beacon: ${report.beacon.count || 0}/5 emits this session`);
  out.push(`OpenClaw gateway: ${report.openclaw_gateway}`);
  const procs = activeProcesses();
  if (procs.length) {
    out.push('');
    out.push('Active lanes:');
    procs.forEach(p => out.push(p));
  } else {
    out.push('Active lanes: idle');
  }
  out.push('');
  if (report.recent_errors.length) {
    out.push('Recent errors (tail):');
    for (const e of report.recent_errors) out.push(`  ${e.slice(0, 200)}`);
  }
  if (report.recent_hook_telemetry.length) {
    out.push('Hook telemetry (tail):');
    for (const t of report.recent_hook_telemetry) out.push(`  ${t.slice(0, 200)}`);
  }
  return out.join('\n');
}

function activeProcesses() {
  const patterns = [
    { label: 'codex exec',        re: /codex.*exec/i },
    { label: 'offload-runner',    re: /offload-runner\.mjs/i },
    { label: 'pulse-lane-dispatch', re: /pulse-lane-dispatch\.mjs/i },
    { label: 'nvidia-nim request',  re: /offload.*nvidia|nvidia.*offload/i },
    { label: 'deepseek request',    re: /offload.*deepseek|deepseek.*offload/i },
  ];
  try {
    const ps = execSync('ps aux', { encoding: 'utf8', timeout: 3000 });
    return patterns
      .map(({ label, re }) => {
        const lines = ps.split('\n').filter(l => re.test(l) && !/grep/.test(l));
        if (!lines.length) return null;
        const pid = lines[0].split(/\s+/)[1];
        const elapsed = lines[0].split(/\s+/).slice(9, 10)[0] || '?';
        return `  ⚡ ${label}  pid=${pid}  cpu-time=${elapsed}`;
      })
      .filter(Boolean);
  } catch { return []; }
}

async function main() {
  const asJSON = process.argv.includes('--json');
  const report = await collect();
  if (asJSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderText(report));
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(`cortex-status fatal: ${e.message}`);
  process.exit(1);
});
