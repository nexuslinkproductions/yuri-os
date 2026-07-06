#!/usr/bin/env node
// @capability: usage-meters (tests)
// @does: Hermetic node:test suite for usage-meters.mjs — record shape, scan idempotency (fake jobs dir via injectable root), pace math (ahead/behind), null-budget behavior, snapshot write.
// @use: node --test _SYSTEM/runtime/usage-meters.test.mjs

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  record,
  scan,
  buildStatus,
  writeSnapshot,
  briefLines,
  POOLS,
  laneIdToPool,
  estimateTokens,
  linearPace,
  periodBounds,
  DEFAULT_CONFIG,
} from './usage-meters.mjs';

// ── temp harness ─────────────────────────────────────────────────────────────
let tmpRoot, stateDir, jobsDir, ledgerPath, watermarkPath, snapshotPath, eventsPath, configPath;

function setupTmp() {
  tmpRoot = mkdtempSync(path.join(tmpdir(), 'usage-meters-test-'));
  stateDir = path.join(tmpRoot, 'state', 'runtime');
  jobsDir = path.join(tmpRoot, 'jobs');
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(jobsDir, { recursive: true });
  ledgerPath = path.join(stateDir, 'usage-ledger.jsonl');
  watermarkPath = path.join(stateDir, 'usage-scan-watermark.json');
  snapshotPath = path.join(stateDir, 'usage-meters.json');
  eventsPath = path.join(stateDir, 'events.jsonl');
  configPath = path.join(stateDir, 'usage-config.json');
}

function teardownTmp() {
  if (tmpRoot && existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true });
}

function writeJobResult(jobName, resultName, data) {
  const dir = path.join(jobsDir, jobName, 'results');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, resultName), JSON.stringify(data));
}

// ════════════════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════════════════

describe('laneIdToPool', () => {
  it('maps glm variants to zai', () => {
    assert.equal(laneIdToPool('glm'), 'zai');
    assert.equal(laneIdToPool('glm-max'), 'zai');
    assert.equal(laneIdToPool('glm-flash'), 'zai');
    assert.equal(laneIdToPool('glm-turbo'), 'zai');
    assert.equal(laneIdToPool('glm-4.7'), 'zai');
  });
  it('maps zai-tmux variants to zai', () => {
    assert.equal(laneIdToPool('zai-tmux:glm-5.2'), 'zai');
    assert.equal(laneIdToPool('zai-tmux:glm-max'), 'zai');
  });
  it('maps cline:glm to zai', () => {
    assert.equal(laneIdToPool('cline:clinepass:glm-5.2'), 'zai');
    assert.equal(laneIdToPool('cline:cline:glm-5.2'), 'zai');
  });
  it('maps ollama-cloud to ollama', () => {
    assert.equal(laneIdToPool('ollama-cloud:deepseek-v4-flash:cloud'), 'ollama');
    assert.equal(laneIdToPool('ollama-cloud:kimi-k2.7-code:cloud'), 'ollama');
  });
  it('maps sonnet to anthropic', () => {
    assert.equal(laneIdToPool('sonnet'), 'anthropic');
    assert.equal(laneIdToPool('opus'), 'anthropic');
  });
  it('returns null for unmapped lanes', () => {
    assert.equal(laneIdToPool('inline:calibrator'), null);
    assert.equal(laneIdToPool(''), null);
    assert.equal(laneIdToPool(null), null);
  });
});

describe('estimateTokens', () => {
  it('estimates chars/4 rounded up', () => {
    assert.equal(estimateTokens(0), 0);
    assert.equal(estimateTokens(4), 1);
    assert.equal(estimateTokens(5), 2);  // ceil(5/4) = 2
    assert.equal(estimateTokens(100), 25);
    assert.equal(estimateTokens(1000), 250);
  });
  it('handles negative by flooring to 0', () => {
    assert.equal(estimateTokens(-100), 0);
  });
});

describe('periodBounds', () => {
  it('returns a week window for week period', () => {
    const now = new Date('2026-07-04T12:00:00Z').getTime();
    const b = periodBounds('week', now);
    assert.equal(b.ms, 7 * 24 * 60 * 60 * 1000);
    assert.equal(b.end - b.start, b.ms);
    // start should be Monday midnight
    const startDay = new Date(b.start);
    assert.equal(startDay.getDay(), 1); // Monday
    assert.equal(startDay.getHours(), 0);
  });
  it('returns correct ms for day period', () => {
    const b = periodBounds('day');
    assert.equal(b.ms, 24 * 60 * 60 * 1000);
  });
  it('defaults to week for unknown period', () => {
    const b = periodBounds('fortnight');
    assert.equal(b.ms, 7 * 24 * 60 * 60 * 1000);
  });
});

describe('linearPace', () => {
  const startMs = new Date('2026-07-01T00:00:00Z').getTime();
  const endMs = new Date('2026-07-08T00:00:00Z').getTime(); // 7 days
  const midWeek = new Date('2026-07-04T12:00:00Z').getTime(); // ~3.5 days = 50% elapsed

  it('returns hold + null headroom when budget is null', () => {
    const p = linearPace(5000, null, { startMs, endMs, now: midWeek });
    assert.equal(p.throttle, 'hold');
    assert.equal(p.headroomPct, null);
    assert.equal(p.aheadBehindPct, null);
    assert.ok(p.reason.includes('no budget'));
  });

  it('reports UP when significantly behind pace', () => {
    // budget=10000, 50% elapsed → target=5000, actual=1000 → way behind
    const p = linearPace(1000, 10000, { startMs, endMs, now: midWeek });
    assert.equal(p.throttle, 'up');
    assert.ok(p.aheadBehindPct < -30);
    assert.ok(p.reason.includes('BEHIND'));
  });

  it('reports DOWN when significantly ahead of pace', () => {
    // budget=10000, 50% elapsed → target=5000, actual=9000 → way ahead
    const p = linearPace(9000, 10000, { startMs, endMs, now: midWeek });
    assert.equal(p.throttle, 'down');
    assert.ok(p.aheadBehindPct > 30);
    assert.ok(p.reason.includes('AHEAD'));
  });

  it('reports HOLD when on track', () => {
    // budget=10000, 50% elapsed → target=5000, actual=5000 → on track
    const p = linearPace(5000, 10000, { startMs, endMs, now: midWeek });
    assert.equal(p.throttle, 'hold');
    assert.ok(Math.abs(p.aheadBehindPct) <= 30);
    assert.ok(p.reason.includes('on track'));
  });

  it('computes elapsedFraction correctly', () => {
    const p = linearPace(5000, 10000, { startMs, endMs, now: midWeek });
    assert.ok(p.elapsedFraction > 0.49 && p.elapsedFraction < 0.51);
    assert.equal(p.targetUsage, 5000);
  });
});

describe('record', () => {
  beforeEach(() => { setupTmp(); });
  afterEach(() => { teardownTmp(); });

  it('records explicit tokens as real (not estimated)', () => {
    const entry = record({ pool: 'zai', tokens: 5000, label: 'test-real' }, { ledgerPath, eventsPath });
    assert.equal(entry.pool, 'zai');
    assert.equal(entry.tokens, 5000);
    assert.equal(entry.estimated, false);
    assert.equal(entry.label, 'test-real');
    assert.equal(entry.source, 'manual');
    assert.ok(entry.t);
  });

  it('records chars as estimated tokens', () => {
    const entry = record({ pool: 'ollama', chars: 1000, label: 'test-est' }, { ledgerPath, eventsPath });
    assert.equal(entry.tokens, 250);  // 1000/4
    assert.equal(entry.estimated, true);
  });

  it('appends to ledger as JSONL', () => {
    record({ pool: 'zai', tokens: 100, label: 'a' }, { ledgerPath, eventsPath });
    record({ pool: 'ollama', tokens: 200, label: 'b' }, { ledgerPath, eventsPath });
    const lines = readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    const e1 = JSON.parse(lines[0]);
    const e2 = JSON.parse(lines[1]);
    assert.equal(e1.pool, 'zai');
    assert.equal(e2.pool, 'ollama');
  });

  it('throws on invalid pool', () => {
    assert.throws(() => record({ pool: 'invalid', tokens: 100 }, { ledgerPath, eventsPath }), /Invalid pool/);
  });

  it('throws when neither tokens nor chars provided', () => {
    assert.throws(() => record({ pool: 'zai' }, { ledgerPath, eventsPath }), /Must provide/);
  });

  it('emits an event to events.jsonl', () => {
    record({ pool: 'zai', tokens: 100, label: 'evt' }, { ledgerPath, eventsPath });
    const events = readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
    assert.ok(events.length >= 1);
    const evt = JSON.parse(events[0]);
    assert.equal(evt.comp, 'meters');
    assert.equal(evt.event, 'record');
    assert.equal(evt.data.pool, 'zai');
  });
});

describe('scan — idempotency', () => {
  beforeEach(() => { setupTmp(); });
  afterEach(() => { teardownTmp(); });

  it('picks up new job result files on first scan', () => {
    writeJobResult('job-1', 'r1.json', {
      laneId: 'glm', text: 'hello world', task: 'do thing', durationMs: 1000, status: 'ok',
    });
    const result = scan({ jobsDir, watermarkPath, ledgerPath, eventsPath });
    assert.ok(result.entriesAdded >= 1);
    assert.ok(result.filesScanned >= 1);
  });

  it('does NOT re-record already-scanned files (watermark idempotency)', () => {
    writeJobResult('job-1', 'r1.json', {
      laneId: 'glm', text: 'hello world', task: 'do thing', durationMs: 1000, status: 'ok',
    });
    // first scan
    const r1 = scan({ jobsDir, watermarkPath, ledgerPath, eventsPath });
    const added1 = r1.entriesAdded;
    // second scan — same files, watermark updated → 0 new
    const r2 = scan({ jobsDir, watermarkPath, ledgerPath, eventsPath });
    assert.equal(r2.entriesAdded, 0, 'second scan should add 0 entries (idempotent)');
  });

  it('picks up only NEW files added after first scan', async () => {
    writeJobResult('job-1', 'r1.json', {
      laneId: 'glm', text: 'first', task: 't', durationMs: 1000, status: 'ok',
    });
    scan({ jobsDir, watermarkPath, ledgerPath, eventsPath });

    // add a new file with a delay so mtime > watermark
    await new Promise(r => setTimeout(r, 50));
    writeJobResult('job-2', 'r2.json', {
      laneId: 'ollama-cloud:kimi:cloud', text: 'second result', task: 't2', durationMs: 2000, status: 'ok',
    });

    const r2 = scan({ jobsDir, watermarkPath, ledgerPath, eventsPath });
    assert.equal(r2.entriesAdded, 1, 'should pick up the one new file');
  });

  it('skips anthropic lanes (handled by usage-governor)', () => {
    writeJobResult('job-a', 'r.json', {
      laneId: 'sonnet', text: 'claude output', task: 't', durationMs: 1000, status: 'ok',
    });
    const result = scan({ jobsDir, watermarkPath, ledgerPath, eventsPath });
    assert.equal(result.entriesAdded, 0, 'anthropic lanes should be skipped by scan');
  });

  it('skips unmapped lanes', () => {
    writeJobResult('job-x', 'r.json', {
      laneId: 'inline:calibrator', text: 'cal', task: 't', durationMs: 1000, status: 'ok',
    });
    const result = scan({ jobsDir, watermarkPath, ledgerPath, eventsPath });
    assert.equal(result.entriesAdded, 0);
  });

  it('skips empty-text results', () => {
    writeJobResult('job-e', 'r.json', {
      laneId: 'glm', text: '', task: '', durationMs: 1000, status: 'fail',
    });
    const result = scan({ jobsDir, watermarkPath, ledgerPath, eventsPath });
    assert.equal(result.entriesAdded, 0);
  });

  it('estimates tokens from text+task chars', () => {
    writeJobResult('job-est', 'r.json', {
      laneId: 'glm', text: 'a'.repeat(100), task: 'b'.repeat(100), durationMs: 1000, status: 'ok',
    });
    const result = scan({ jobsDir, watermarkPath, ledgerPath, eventsPath });
    assert.equal(result.entriesAdded, 1);
    assert.equal(result.newEntries[0].tokens, 50); // 200 chars / 4
    assert.equal(result.newEntries[0].estimated, true);
    assert.equal(result.newEntries[0].pool, 'zai');
  });

  it('handles missing jobs dir gracefully', () => {
    const result = scan({ jobsDir: '/nonexistent/path', watermarkPath, ledgerPath, eventsPath });
    assert.equal(result.entriesAdded, 0);
    assert.equal(result.filesScanned, 0);
  });
});

describe('buildStatus', () => {
  beforeEach(() => { setupTmp(); });
  afterEach(() => { teardownTmp(); });

  it('returns per-pool structure for all three pools', async () => {
    record({ pool: 'zai', tokens: 1000, label: 'a' }, { ledgerPath, eventsPath });
    const status = await buildStatus({ ledgerPath, configPath, useGovernor: false });
    for (const pool of POOLS) {
      assert.ok(status.perPool[pool], `pool ${pool} missing`);
      assert.ok(status.perPool[pool].usage);
      assert.ok(status.perPool[pool].window);
      assert.ok(status.perPool[pool].pace);
    }
  });

  it('splits real vs estimated tokens', async () => {
    record({ pool: 'zai', tokens: 1000, label: 'real' }, { ledgerPath, eventsPath });        // real
    record({ pool: 'zai', chars: 400, label: 'est' }, { ledgerPath, eventsPath });           // estimated=100
    const status = await buildStatus({ ledgerPath, configPath, useGovernor: false });
    const zai = status.perPool.zai;
    assert.equal(zai.usage.real, 1000);
    assert.equal(zai.usage.estimated, 100);
    assert.equal(zai.usage.total, 1100);
    assert.ok(zai.usage.estimatedFraction > 0);
  });

  it('null budget → no pace verdict, hold throttle', async () => {
    record({ pool: 'ollama', tokens: 5000, label: 'x' }, { ledgerPath, eventsPath });
    const status = await buildStatus({ ledgerPath, configPath, useGovernor: false });
    const ol = status.perPool.ollama;
    assert.equal(ol.budget, null);
    assert.equal(ol.budgetPct, null);
    assert.equal(ol.pace.throttle, 'hold');
    assert.equal(ol.pace.headroomPct, null);
  });

  it('with budget → computes pace verdict', async () => {
    // write config with a budget
    writeFileSync(configPath, JSON.stringify({
      pools: { zai: { period: 'week', budget: 10000 }, ollama: { period: 'week', budget: null }, anthropic: { period: 'week', budget: null } },
    }));
    record({ pool: 'zai', tokens: 8000, label: 'lots' }, { ledgerPath, eventsPath });
    const status = await buildStatus({ ledgerPath, configPath, useGovernor: false });
    const zai = status.perPool.zai;
    assert.equal(zai.budget, 10000);
    assert.equal(zai.budgetPct, 80);
    // pace method should be linear
    assert.equal(zai.pace.method, 'linear-consume-by-deadline');
    assert.ok(zai.pace.reason);
  });

  it('includes generatedAt and config in output', async () => {
    const status = await buildStatus({ ledgerPath, configPath, useGovernor: false });
    assert.ok(status.generatedAt);
    assert.ok(status.config);
    assert.ok(status.config.pools);
  });
});

describe('writeSnapshot', () => {
  beforeEach(() => { setupTmp(); });
  afterEach(() => { teardownTmp(); });

  it('writes usage-meters.json snapshot to disk', async () => {
    record({ pool: 'zai', tokens: 500, label: 'snap' }, { ledgerPath, eventsPath });
    const result = await writeSnapshot({ ledgerPath, configPath, snapshotPath, eventsPath, useGovernor: false });
    assert.ok(existsSync(snapshotPath));
    const snap = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    assert.ok(snap.generatedAt);
    assert.ok(snap.perPool);
    assert.equal(snap.perPool.zai.usage.total, 500);
  });

  it('snapshot includes all pools', async () => {
    const result = await writeSnapshot({ ledgerPath, configPath, snapshotPath, eventsPath, useGovernor: false });
    const snap = result.status;
    for (const pool of POOLS) {
      assert.ok(snap.perPool[pool]);
    }
  });
});

// ── briefLines contract (seam for morning-brief) ─────────────────────────────

describe('briefLines', () => {
  beforeEach(() => { setupTmp(); });
  afterEach(() => { teardownTmp(); });

  it('returns compact per-pool lines for a real-shaped snapshot', () => {
    const snap = {
      generatedAt: '2026-07-04T19:37:10.707Z',
      config: { pools: {} },
      perPool: {
        zai: {
          period: 'week',
          window: { start: '2026-06-28T22:00:00.000Z', end: '2026-07-05T22:00:00.000Z' },
          usage: { total: 108627, real: 0, estimated: 108627, estimatedFraction: 100, events: 171 },
          budget: null, budgetPct: null,
          pace: { method: 'linear', throttle: 'hold', headroomPct: null, aheadBehindPct: null, reason: 'no budget' },
        },
        ollama: {
          period: 'week',
          window: { start: '2026-06-28T22:00:00.000Z', end: '2026-07-05T22:00:00.000Z' },
          usage: { total: 28918, real: 0, estimated: 28918, estimatedFraction: 100, events: 28 },
          budget: null, budgetPct: null,
          pace: { method: 'linear', throttle: 'hold', headroomPct: null, aheadBehindPct: null, reason: 'no budget' },
        },
        anthropic: {
          period: 'week',
          window: { start: '2026-06-28T22:00:00.000Z', end: '2026-07-05T22:00:00.000Z' },
          usage: { total: 0, real: 0, estimated: 0, estimatedFraction: 0, events: 0 },
          budget: null, budgetPct: null,
          pace: { method: 'linear', throttle: 'hold', headroomPct: null, aheadBehindPct: null, reason: 'no budget' },
        },
      },
    };
    const result = briefLines(snap);
    assert.ok(result.lines, 'has lines array');
    assert.equal(result.lines.length, 3, 'three pool lines');
    const zaiLine = result.lines.find(l => l.includes('zai:'));
    assert.ok(zaiLine, 'zai line exists');
    assert.ok(zaiLine.includes('108,627 tok'), 'comma-formatted token count');
    assert.ok(zaiLine.includes('(est)'), 'estimated label');
    assert.ok(zaiLine.includes('pace HOLD'), 'pace verb');
    assert.ok(zaiLine.includes('no budget'), 'budget detail');
    assert.ok(zaiLine.includes('week 2026-06-28→07-05'), 'week window with stripped year on end');
  });

  it('returns unavailable for null snapshot', () => {
    const result = briefLines(null);
    assert.ok(result.unavailable, 'unavailable on null');
  });

  it('returns unavailable for snapshot without perPool', () => {
    const result = briefLines({ generatedAt: 'x', config: {} });
    assert.ok(result.unavailable, 'unavailable when no perPool');
  });

  it('returns unavailable for snapshot with empty perPool', () => {
    const result = briefLines({ perPool: {} });
    assert.ok(result.unavailable, 'unavailable when perPool empty');
  });

  it('includes budget detail when budget is set', async () => {
    // Build a real status with a budget
    writeFileSync(configPath, JSON.stringify({
      pools: { zai: { period: 'week', budget: 10000 }, ollama: { period: 'week', budget: null }, anthropic: { period: 'week', budget: null } },
    }));
    record({ pool: 'zai', tokens: 8000, label: 'budget-test' }, { ledgerPath, eventsPath });
    const status = await buildStatus({ ledgerPath, configPath, useGovernor: false });
    const result = briefLines(status);
    const zaiLine = result.lines.find(l => l.includes('zai:'));
    assert.ok(zaiLine.includes('headroom'), 'shows headroom when budget set');
  });

  it('works against a real writeSnapshot output (end-to-end)', async () => {
    record({ pool: 'zai', tokens: 500, label: 'e2e' }, { ledgerPath, eventsPath });
    const snapResult = await writeSnapshot({ ledgerPath, configPath, snapshotPath, eventsPath, useGovernor: false });
    const result = briefLines(snapResult.status);
    assert.ok(result.lines, 'lines from real snapshot');
    assert.ok(result.lines.some(l => l.includes('zai:')), 'zai line present');
  });
});

// ── red-team: scan double-count across watermark edge (same-mtime files) ──────

describe('scan — same-mtime double-count edge', () => {
  beforeEach(() => { setupTmp(); });
  afterEach(() => { teardownTmp(); });

  it('does not double-count files with identical mtime across scan passes', () => {
    // Write 3 files with IDENTICAL mtime
    const fixedDate = new Date(1700000000000);
    for (let i = 0; i < 3; i++) {
      writeJobResult(`job-${i}`, 'r.json', {
        laneId: 'glm', text: 'x'.repeat(40), task: 'y', durationMs: 1000, status: 'ok',
      });
      // Force identical mtime on all 3
      utimesSync(path.join(jobsDir, `job-${i}`, 'results', 'r.json'), fixedDate, fixedDate);
    }
    // First scan: all 3 should be recorded
    const r1 = scan({ jobsDir, watermarkPath: watermarkPath, ledgerPath, eventsPath });
    assert.equal(r1.entriesAdded, 3, 'all 3 same-mtime files recorded in pass 1');
    // Second scan: 0 new (watermark advanced past them)
    const r2 = scan({ jobsDir, watermarkPath: watermarkPath, ledgerPath, eventsPath });
    assert.equal(r2.entriesAdded, 0, '0 new entries in pass 2 (no double-count)');
    // Ledger should have exactly 3 lines
    const ledgerLines = readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(ledgerLines.length, 3, 'ledger has exactly 3 entries');
  });
});
