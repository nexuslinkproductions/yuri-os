import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openColdStore, getCold, coldCount } from './memory-cold-store.mjs';
import { buildItem, planRelocations, loadItems, executeRelocation, promoteHot } from './memory-relocator.mjs';

const DAY = 86400000;
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reloc-'));
const writeMem = (root, name, body) => { const f = path.join(root, name); fs.writeFileSync(f, body); return f; };

test('planRelocations (pure): decayed demotes, fresh + force-keep stay', () => {
  const now = 300 * DAY;
  const items = [
    { slug: 'stale', baseStabilityDays: 14, lastUsedMs: 0, useCount: 0, salience: 0, forceKeep: false },
    { slug: 'fresh', baseStabilityDays: 14, lastUsedMs: now, useCount: 0, salience: 0, forceKeep: false },
    { slug: 'locked', baseStabilityDays: 14, lastUsedMs: 0, useCount: 0, salience: 0, forceKeep: true },
  ];
  const { demote, keep } = planRelocations(items, { nowMs: now, rFloor: 0.6 });
  assert.deepEqual(demote.map((d) => d.slug), ['stale']);
  assert.deepEqual(keep.map((k) => k.slug).sort(), ['fresh', 'locked']);
});

test('buildItem: force_keep flag honored; tier sets base stability', () => {
  assert.equal(buildItem('/x/a.md', '---\nname: a\nforce_keep: true\n---\nbody', { nowMs: 1000 }).forceKeep, true);
  assert.equal(buildItem('/x/b.md', '---\nname: b\ntier: semantic\n---\nbody', { nowMs: 1000 }).baseStabilityDays, 60);
  assert.equal(buildItem('/x/c.md', '---\nname: c\narchive: false\n---\nbody', { nowMs: 1000 }).forceKeep, true);
});

test('full demote -> cold -> promote round-trip preserves the body BYTE-IDENTICAL', () => {
  const root = tmpRoot();
  const body = '---\nname: doomed\n---\n# Doomed\nverbatim ⟦body⟧ 100% kept\n';
  const f = writeMem(root, 'doomed.md', body);
  const old = new Date(Date.now() - 400 * DAY);
  fs.utimesSync(f, old, old);                                  // looks long-unused
  const db = openColdStore(':memory:');

  const items = loadItems(root, { nowMs: Date.now(), usageIndex: {} });
  const plan = planRelocations(items, { nowMs: Date.now(), rFloor: 0.6 });
  assert.ok(plan.demote.some((d) => d.slug === 'doomed'), 'old unused memory should demote');

  const res = executeRelocation(plan, { coldDb: db, root, dryRun: false, nowMs: Date.now() });
  assert.ok(res.demoted >= 1);
  assert.equal(fs.existsSync(f), false);                                          // moved out of active
  assert.equal(fs.existsSync(path.join(root, 'relocated', 'doomed.md')), true);   // reversible copy kept
  assert.equal(getCold(db, 'doomed').body, body);                                 // in cold, byte-identical

  const promo = promoteHot('doomed', { coldDb: db, root, nowMs: Date.now() });
  assert.equal(promo.ok, true);
  assert.equal(fs.readFileSync(path.join(root, 'doomed.md'), 'utf8'), body);       // restored byte-identical
  assert.equal(coldCount(db), 0);                                                  // cleared from cold
  db.close();
});

test('dry-run plans without touching the filesystem', () => {
  const root = tmpRoot();
  const f = writeMem(root, 'd.md', '---\nname: d\n---\nx');
  const old = new Date(Date.now() - 400 * DAY);
  fs.utimesSync(f, old, old);
  const items = loadItems(root, { nowMs: Date.now(), usageIndex: {} });
  const plan = planRelocations(items, { nowMs: Date.now(), rFloor: 0.6 });
  const res = executeRelocation(plan, { coldDb: null, root, dryRun: true });
  assert.equal(res.dryRun, true);
  assert.equal(fs.existsSync(f), true);                                            // untouched
});
