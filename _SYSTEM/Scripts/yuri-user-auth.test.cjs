const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const auth = require('./yuri-user-auth.cjs');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auth-')), 'user-auth.json');

test('setPassword returns a formatted reset code and persists only hashes', () => {
  const f = tmp();
  const { resetCode } = auth.setPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-01' });
  assert.match(resetCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const raw = fs.readFileSync(f, 'utf8');
  assert.ok(!raw.includes('test-only-password-NOT-REAL-01'), 'password must never be persisted in clear');
  assert.ok(!raw.includes(resetCode), 'reset code must never be persisted in clear (only its hash)');
});

test('verifyPassword true on match, false on mismatch', () => {
  const f = tmp();
  auth.setPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-02' });
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-02' }), true);
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-03' }), false);
});

test('resetWithCode rotates the password and consumes the code (single use)', () => {
  const f = tmp();
  const { resetCode } = auth.setPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-04' });
  const ok = auth.resetWithCode({ file: f, handle: 'mike', resetCode, newPassword: 'test-only-password-NOT-REAL-05' });
  assert.equal(ok.ok, true);
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-05' }), true);
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-04' }), false);
  // code is now consumed — cannot be reused
  assert.throws(() => auth.resetWithCode({ file: f, handle: 'mike', resetCode, newPassword: 'test-only-password-NOT-REAL-06' }), /consumed/i);
});

test('resetWithCode rejects a wrong code', () => {
  const f = tmp();
  auth.setPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-04' });
  assert.throws(() => auth.resetWithCode({ file: f, handle: 'mike', resetCode: 'ZZZZ-ZZZZ-ZZZZ', newPassword: 'test-only-password-NOT-REAL-05' }), /does not match/i);
});

test('setPassword rejects too-short passwords', () => {
  const f = tmp();
  assert.throws(() => auth.setPassword({ file: f, handle: 'mike', password: 'short' }), /at least/i);
});

test('adminReset requires dev role and re-arms a usable reset code', () => {
  const f = tmp();
  auth.setPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-07' });
  // coworker is denied
  assert.throws(() => auth.adminReset({ file: f, handle: 'mike', roleResolver: () => 'coworker' }), /dev role required/);
  // dev gets a fresh code, which Mike can use to set a new password
  const { resetCode } = auth.adminReset({ file: f, handle: 'mike', roleResolver: () => 'dev' });
  assert.match(resetCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  auth.resetWithCode({ file: f, handle: 'mike', resetCode, newPassword: 'test-only-password-NOT-REAL-08' });
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'test-only-password-NOT-REAL-08' }), true);
});

test('adminReset can bootstrap an unknown handle (new device) under dev role', () => {
  const f = tmp();
  const { resetCode } = auth.adminReset({ file: f, handle: 'newuser', roleResolver: () => 'dev' });
  auth.resetWithCode({ file: f, handle: 'newuser', resetCode, newPassword: 'test-only-password-NOT-REAL-09' });
  assert.equal(auth.verifyPassword({ file: f, handle: 'newuser', password: 'test-only-password-NOT-REAL-09' }), true);
});
