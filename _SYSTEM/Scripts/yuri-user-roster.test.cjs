const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const roster = require('./yuri-user-roster.cjs');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roster-')), 'user-roster.json');

test('addUser creates a normalized githubId-keyed entry with NO secret fields', () => {
  const f = tmpFile();
  const e = roster.addUser({ file: f, githubId: 'mike', displayName: 'Mike', role: 'coworker' });
  assert.equal(e.githubId, 'mike');
  assert.equal(e.handle, 'mike');
  assert.equal(e.displayName, 'Mike');
  assert.equal(e.role, 'coworker');
  assert.equal(e.dataPath, 'user-data/mike');
  assert.equal(e.consent, null);
  // Hard guarantee: a roster entry never carries a secret-ish field.
  for (const k of Object.keys(e)) {
    assert.ok(!/pass|hash|secret|key|token/i.test(k), `roster leaked secret-ish field: ${k}`);
  }
});

test('addUser is idempotent on githubId and preserves consent across re-add', () => {
  const f = tmpFile();
  roster.addUser({ file: f, githubId: 'mike', displayName: 'Mike', role: 'coworker' });
  roster.recordConsent({ file: f, githubId: 'mike', version: 'v1' });
  const again = roster.addUser({ file: f, githubId: 'mike', displayName: 'Mike', role: 'dev' });
  assert.equal(again.role, 'dev');
  assert.ok(again.consent && again.consent.version === 'v1', 'consent must survive re-add');
  assert.equal(roster.listUsers({ file: f }).length, 1);
});

test('githubId is the dedup anchor; handle derives from displayName (friendly + stable)', () => {
  const f = tmpFile();
  // mixed-case githubId, friendly displayName → handle from displayName
  const e = roster.addUser({ file: f, githubId: 'NotMeeMan', displayName: 'Mike' });
  assert.equal(e.githubId, 'NotMeeMan'); // anchor stored verbatim
  assert.equal(e.handle, 'mike');        // label from displayName
  assert.equal(e.dataPath, 'user-data/mike');
  // re-add with same githubId, different displayName → updates, dedups on githubId
  const again = roster.addUser({ file: f, githubId: 'NotMeeMan', displayName: 'Michael' });
  assert.equal(again.displayName, 'Michael');
  assert.equal(roster.listUsers({ file: f }).length, 1);
});

test('an explicit handle overrides the displayName-derived one', () => {
  const f = tmpFile();
  const e = roster.addUser({ file: f, githubId: 'nexuslinkproductions', displayName: 'Marcel', handle: 'marcel' });
  assert.equal(e.handle, 'marcel');
  assert.equal(e.githubId, 'nexuslinkproductions');
});

test('recordConsent throws on unknown githubId', () => {
  const f = tmpFile();
  assert.throws(() => roster.recordConsent({ file: f, githubId: 'ghost', version: 'v1' }), /unknown githubId/);
});

test('getUser returns null for unknown githubId', () => {
  const f = tmpFile();
  assert.equal(roster.getUser({ file: f, githubId: 'ghost' }), null);
});

test('addUser throws when githubId is missing or empty', () => {
  const f = tmpFile();
  assert.throws(() => roster.addUser({ file: f, githubId: '!!!', displayName: 'X' }), /githubId required/);
  assert.throws(() => roster.addUser({ file: f, displayName: 'X' }), /githubId required/);
});

test('CONSENT_VERSION is exported and CONSENT.md exists next to the roster', () => {
  assert.equal(typeof roster.CONSENT_VERSION, 'string');
  assert.ok(roster.CONSENT_VERSION.length > 0);
  const consentPath = path.join(roster.DEFAULT_FILE, '..', 'CONSENT.md');
  assert.ok(fs.existsSync(consentPath), 'CONSENT.md must exist next to roster');
});
