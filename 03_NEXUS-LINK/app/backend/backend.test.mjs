// NEXUS backend spine — test suite. Run: node --test backend/
// All state lives in per-test temp dirs; the default singletons are never touched.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createStore } from './store.mjs';
import { createPolicy, verifyAuditFile } from './policy.mjs';
import { createRulesEngine } from './rules.mjs';
import { createAlerts } from './alerts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_CLI = path.join(__dirname, 'verify.mjs');

const tmp = () => mkdtempSync(path.join(tmpdir(), 'nexus-backend-test-'));

// ── module 1: store ─────────────────────────────────────────────────────────
test('store: put/get round-trip, query by type and marking, remove cascades', () => {
  const dir = tmp();
  const store = createStore(path.join(dir, 'nexus.db'));

  store.put({ id: 'n1', type: 'note', confidence: 80, markings: ['private'], data: { text: 'hello' } });
  const got = store.get('n1');
  assert.equal(got.type, 'note');
  assert.equal(got.confidence, 80);
  assert.deepEqual(got.markings, ['private']);
  assert.equal(got.data.text, 'hello');
  assert.ok(got.created && got.modified);

  // upsert keeps created, bumps modified, replaces data
  const created1 = got.created;
  store.put({ id: 'n1', type: 'note', data: { text: 'updated' } });
  const got2 = store.get('n1');
  assert.equal(got2.created, created1);
  assert.equal(got2.data.text, 'updated');
  assert.deepEqual(got2.markings, ['private']); // preserved when not given

  store.put({ id: 's1', type: 'signal', markings: ['public-ready'], data: {} });
  assert.deepEqual(store.query({ type: 'note' }).map(o => o.id), ['n1']);
  assert.deepEqual(store.query({ marking: 'public-ready' }).map(o => o.id), ['s1']);
  assert.throws(() => store.put({ id: 'x', type: 'bogus' }), /unknown_object_type/);

  store.relate('s1', 'n1', 'references');
  assert.equal(store.relsFrom('s1').length, 1);
  store.remove('n1');
  assert.equal(store.get('n1'), null);
  assert.equal(store.relsFrom('s1').length, 0, 'remove cascades relationships');
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test('store: relationships, traversal helpers, indexDraft upsert', () => {
  const dir = tmp();
  const store = createStore(path.join(dir, 'nexus.db'));

  const d = store.indexDraft('2026-07-29/threads-a.md',
    { platform: 'threads', status: 'draft', created: '2026-07-29', media_needed: 'READY — media/a.png' },
    'post body');
  assert.equal(d.type, 'draft');
  assert.equal(d.data.status, 'draft');
  assert.equal(d.data.media_ready, true);
  assert.equal(d.data.chars, 9);

  // re-index after approval: created preserved, status flips
  const d2 = store.indexDraft('2026-07-29/threads-a.md',
    { platform: 'threads', status: 'approved', created: '2026-07-29', media_needed: 'READY — media/a.png' },
    'post body');
  assert.equal(d2.created, d.created);
  assert.equal(d2.data.status, 'approved');

  // media_ready derivation
  const d3 = store.indexDraft('2026-07-29/threads-b.md', { status: 'draft', media_needed: 'hero image wanted' }, 'x');
  assert.equal(d3.data.media_ready, false);
  const d4 = store.indexDraft('2026-07-29/threads-c.md', { status: 'draft', media_needed: 'none' }, 'x');
  assert.equal(d4.data.media_ready, true);

  store.relate('2026-07-29/threads-a.md', 'marcel', 'approved-by');
  store.relate('2026-07-29/threads-a.md', 'sig-1', 'derived-from');
  assert.equal(store.hasRel('2026-07-29/threads-a.md', 'marcel', 'approved-by'), true);
  assert.equal(store.relsFrom('2026-07-29/threads-a.md').length, 2);
  assert.equal(store.relsFrom('2026-07-29/threads-a.md', 'derived-from').length, 1);
  assert.equal(store.relsTo('marcel', 'approved-by').length, 1);
  store.unrelate('2026-07-29/threads-a.md', 'marcel', 'approved-by');
  assert.equal(store.hasRel('2026-07-29/threads-a.md', 'marcel', 'approved-by'), false);
  assert.throws(() => store.relate('a', 'b', 'bogus-rel'), /unknown_rel_type/);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

// ── module 2: policy gate + audit chain ─────────────────────────────────────
test('policy: deny-by-default, approval rule, audit append', () => {
  const dir = tmp();
  const store = createStore(path.join(dir, 'nexus.db'));
  const auditPath = path.join(dir, 'audit.jsonl');
  const policy = createPolicy({ store, auditPath });

  // unregistered action denied
  let r = policy.authorize('dashboard', 'draft.nuke', { id: 'x' });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'unregistered_action');

  // post.execute on unapproved draft denied
  store.indexDraft('d1', { status: 'draft', media_needed: 'none' }, 'body');
  r = policy.authorize('dashboard', 'post.execute', { id: 'd1' });
  assert.equal(r.decision, 'deny');
  assert.equal(r.reason, 'not_approved');

  // after approval it allows; also via approved-by relationship alone
  store.indexDraft('d1', { status: 'approved', media_needed: 'none' }, 'body');
  r = policy.authorize('dashboard', 'post.execute', { id: 'd1' });
  assert.equal(r.decision, 'allow');
  store.indexDraft('d2', { status: 'draft', media_needed: 'none' }, 'body');
  store.relate('d2', 'marcel', 'approved-by');
  assert.equal(policy.authorize('marcel', 'post.execute', { id: 'd2' }).decision, 'allow');

  // store.delete owner-only
  assert.equal(policy.authorize('apollo', 'store.delete', { id: 'd1' }).decision, 'deny');
  assert.equal(policy.authorize('marcel', 'store.delete', { id: 'd1' }).decision, 'allow');

  // every call appended an event
  const lines = readFileSync(auditPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 6);
  const ev = JSON.parse(lines[1]);
  assert.equal(ev.action, 'post.execute');
  assert.equal(ev.decision, 'deny');
  assert.equal(ev.args_sha256.length, 64);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test('policy: hash chain verifies, tampering is detected', () => {
  const dir = tmp();
  const store = createStore(path.join(dir, 'nexus.db'));
  const auditPath = path.join(dir, 'audit.jsonl');
  const policy = createPolicy({ store, auditPath });

  policy.authorize('dashboard', 'draft.edit', { id: 'a' });
  policy.authorize('dashboard', 'draft.approve', { id: 'a' });
  policy.authorize('dashboard', 'post.execute', { id: 'a' });

  const ok = policy.verifyAuditChain();
  assert.equal(ok.ok, true);
  assert.equal(ok.events, 3);
  assert.equal(verifyAuditFile(auditPath).ok, true);

  // chain continues correctly across process restarts (fresh policy, same file)
  const policy2 = createPolicy({ store, auditPath });
  policy2.authorize('dashboard', 'draft.edit', { id: 'b' });
  assert.equal(policy2.verifyAuditChain().events, 4);

  // interleaved writers (dashboard + MCP processes) must not fork the chain
  const policyA = createPolicy({ store, auditPath: auditPath });
  const policyB = createPolicy({ store, auditPath: auditPath });
  policyA.authorize('dashboard', 'draft.edit', { id: 'a1' });
  policyB.authorize('mcp', 'draft.edit', { id: 'b1' });
  policyA.authorize('dashboard', 'draft.approve', { id: 'a1' });
  policyB.authorize('mcp', 'post.execute', { id: 'b1' });
  const multi = verifyAuditFile(auditPath);
  assert.equal(multi.ok, true);
  assert.equal(multi.events, 8);

  // tamper: flip a decision in event 2
  const lines = readFileSync(auditPath, 'utf8').trim().split('\n');
  const ev = JSON.parse(lines[1]);
  ev.decision = ev.decision === 'allow' ? 'deny' : 'allow';
  lines[1] = JSON.stringify(ev);
  writeFileSync(auditPath, lines.join('\n') + '\n');
  const broken = verifyAuditFile(auditPath);
  assert.equal(broken.ok, false);
  assert.equal(broken.broken_at, 1);
  assert.equal(broken.error, 'hash_mismatch');

  // truncation also breaks linkage expectations (hash of removed head)
  writeFileSync(auditPath, lines.slice(2).join('\n') + '\n');
  const truncated = verifyAuditFile(auditPath);
  assert.equal(truncated.ok, false);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

// ── module 3: detection rules ───────────────────────────────────────────────
test('rules: seed rules fire on a crafted event sequence', () => {
  const dir = tmp();
  const store = createStore(path.join(dir, 'nexus.db'));
  const auditPath = path.join(dir, 'audit.jsonl');
  const policy = createPolicy({ store, auditPath });
  const engine = createRulesEngine({ store, policy });
  assert.equal(engine.rules.length, 4);

  // 1. unapproved post attempt -> post-attempt-unapproved
  store.indexDraft('d1', { status: 'draft', media_needed: 'none' }, 'x');
  policy.authorize('dashboard', 'post.execute', { id: 'd1' });

  // 2. approve a draft whose media is missing -> media-missing-on-approve
  store.indexDraft('d2', { status: 'draft', media_needed: 'hero image wanted' }, 'x');
  policy.authorize('dashboard', 'draft.approve', { id: 'd2' });

  // 3. edit an approved draft -> draft-edited-after-approval
  store.indexDraft('d3', { status: 'approved', media_needed: 'none' }, 'x');
  policy.authorize('dashboard', 'draft.edit', { id: 'd3' });

  // 4. foreign actor -> foreign-writer (also re-fires edited-after-approval on d3)
  policy.authorize('mallory', 'draft.edit', { id: 'd3' });

  const alerts = store.query({ type: 'alert' });
  const byRule = {};
  for (const a of alerts) byRule[a.data.rule_id] = (byRule[a.data.rule_id] || 0) + 1;
  assert.equal(byRule['post-attempt-unapproved'], 1);
  assert.equal(byRule['media-missing-on-approve'], 1);
  assert.equal(byRule['draft-edited-after-approval'], 2); // dashboard + mallory edits
  assert.equal(byRule['foreign-writer'], 1);
  assert.equal(alerts.length, 5);

  const fw = alerts.find(a => a.data.rule_id === 'foreign-writer');
  assert.equal(fw.data.actor, 'mallory');
  assert.equal(fw.data.severity, 'critical');
  assert.equal(fw.data.score, 75);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

// ── module 4: RBA alerts ────────────────────────────────────────────────────
test('alerts: rolling window, cumulative threshold', () => {
  const dir = tmp();
  const store = createStore(path.join(dir, 'nexus.db'));
  const alerts = createAlerts({ store, threshold: 75 });

  const put = (actor, rule, score, ts) => store.put({
    id: `a-${actor}-${rule}-${ts}`, type: 'alert',
    data: { actor, rule_id: rule, score, severity: 'high', description: rule, ts },
  });

  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();

  // below threshold: nothing
  put('dashboard', 'post-attempt-unapproved', 40, iso(1000));
  assert.equal(alerts.getBanner(now).alerts.length, 0);

  // second hit crosses 75 -> one banner group with cumulative score 80
  put('dashboard', 'post-attempt-unapproved', 40, iso(500));
  let banner = alerts.getBanner(now);
  assert.equal(banner.alerts.length, 1);
  assert.equal(banner.alerts[0].score, 80);
  assert.equal(banner.alerts[0].count, 2);
  assert.equal(banner.alerts[0].actor, 'dashboard');
  assert.equal(banner.threshold, 75);

  // different actor tracked separately
  put('mallory', 'post-attempt-unapproved', 40, iso(100));
  banner = alerts.getBanner(now);
  assert.equal(banner.alerts.length, 1, 'mallory alone is below threshold');

  // outside the 24h window does not count
  const old = new Date(now - 25 * 3600 * 1000).toISOString();
  store.put({ id: 'a-old', type: 'alert', data: { actor: 'x', rule_id: 'r', score: 100, ts: old } });
  assert.equal(alerts.getBanner(now).alerts.length, 1);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

// ── module 5: verify toolkit ────────────────────────────────────────────────
test('verify: sweep catches planted keys, exit codes, manifest + report', () => {
  const dir = tmp();
  writeFileSync(path.join(dir, 'clean.txt'), 'nothing to see here\n');
  writeFileSync(path.join(dir, 'leaky.js'),
    'const aws = "AKIAIOSFODNN7EXAMPLE";\n' +
    'const gh = "ghp_' + 'a'.repeat(36) + '";\n' +
    'const ai = "sk-ant-' + 'b'.repeat(30) + '";\n' +
    '-----BEGIN PRIVATE KEY-----\n');

  const run = spawnSync(process.execPath, [VERIFY_CLI, dir], { encoding: 'utf8' });
  assert.equal(run.status, 1, run.stderr + run.stdout);
  assert.match(run.stderr, /aws-access-key/);
  assert.match(run.stderr, /github-token/);
  assert.match(run.stderr, /anthropic-key/);
  assert.match(run.stderr, /private-key-block/);
  // planted key material is masked in output
  assert.ok(!run.stderr.includes('AKIAIOSFODNN7EXAMPLE'), 'no raw secret in output');

  const report = JSON.parse(readFileSync(path.join(dir, 'nexus-verify-report.json'), 'utf8'));
  assert.equal(report.findings.length, 4);
  const manifest = JSON.parse(readFileSync(path.join(dir, 'nexus-verify-manifest.json'), 'utf8'));
  assert.ok(manifest['leaky.js'] && manifest['clean.txt'], 'manifest covers scanned files');

  // clean dir exits 0
  const cleanDir = tmp();
  writeFileSync(path.join(cleanDir, 'fine.md'), 'all good\n');
  const runClean = spawnSync(process.execPath, [VERIFY_CLI, cleanDir], { encoding: 'utf8' });
  assert.equal(runClean.status, 0, runClean.stderr + runClean.stdout);
  assert.match(runClean.stdout, /no secrets found/);

  rmSync(dir, { recursive: true, force: true });
  rmSync(cleanDir, { recursive: true, force: true });
});

test('verify: --audit re-verifies the chain, non-zero on break', () => {
  const dir = tmp();
  const store = createStore(path.join(dir, 'nexus.db'));
  const auditPath = path.join(dir, 'audit.jsonl');
  const policy = createPolicy({ store, auditPath });
  policy.authorize('dashboard', 'draft.edit', { id: 'a' });
  policy.authorize('dashboard', 'draft.approve', { id: 'a' });

  const good = spawnSync(process.execPath, [VERIFY_CLI, '--audit', auditPath], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr + good.stdout);
  assert.match(good.stdout, /audit chain OK — 2 event/);

  appendFileSync(auditPath, JSON.stringify({ ts: 'x', actor: 'y', action: 'z', args_sha256: '0', decision: 'allow', reason: 'ok', prev_hash: 'bogus', hash: 'bogus' }) + '\n');
  const bad = spawnSync(process.execPath, [VERIFY_CLI, '--audit', auditPath], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /BROKEN/);
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
