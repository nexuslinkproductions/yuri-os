const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const auth = require('./yuri-user-auth.cjs');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auth-')), 'user-auth.json');

test('setPassword returns a formatted reset code and persists only hashes', () => {
  const f = tmp();
  const { resetCode } = auth.setPassword({ file: f, handle: 'mike', password: 'correct horse battery' });
  assert.match(resetCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const raw = fs.readFileSync(f, 'utf8');
  assert.ok(!raw.includes('correct horse battery'), 'password must never be persisted in clear');
  assert.ok(!raw.includes(resetCode), 'reset code must never be persisted in clear (only its hash)');
});

test('verifyPassword true on match, false on mismatch', () => {
  const f = tmp();
  auth.setPassword({ file: f, handle: 'mike', password: 'pw-one-2-three' });
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'pw-one-2-three' }), true);
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'wrong-password' }), false);
});

test('resetWithCode rotates the password and consumes the code (single use)', () => {
  const f = tmp();
  const { resetCode } = auth.setPassword({ file: f, handle: 'mike', password: 'old-pw-aaaa' });
  const ok = auth.resetWithCode({ file: f, handle: 'mike', resetCode, newPassword: 'new-pw-bbbb' });
  assert.equal(ok.ok, true);
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'new-pw-bbbb' }), true);
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'old-pw-aaaa' }), false);
  // code is now consumed — cannot be reused
  assert.throws(() => auth.resetWithCode({ file: f, handle: 'mike', resetCode, newPassword: 'x-pw-cccc-z' }), /consumed/i);
});

test('resetWithCode rejects a wrong code', () => {
  const f = tmp();
  auth.setPassword({ file: f, handle: 'mike', password: 'old-pw-aaaa' });
  assert.throws(() => auth.resetWithCode({ file: f, handle: 'mike', resetCode: 'ZZZZ-ZZZZ-ZZZZ', newPassword: 'new-pw-bbbb' }), /does not match/i);
});

test('setPassword rejects too-short passwords', () => {
  const f = tmp();
  assert.throws(() => auth.setPassword({ file: f, handle: 'mike', password: 'short' }), /at least/i);
});

test('adminReset requires dev role and re-arms a usable reset code', () => {
  const f = tmp();
  auth.setPassword({ file: f, handle: 'mike', password: 'mike-pw-1234' });
  // coworker is denied
  assert.throws(() => auth.adminReset({ file: f, handle: 'mike', roleResolver: () => 'coworker' }), /dev role required/);
  // dev gets a fresh code, which Mike can use to set a new password
  const { resetCode } = auth.adminReset({ file: f, handle: 'mike', roleResolver: () => 'dev' });
  assert.match(resetCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  auth.resetWithCode({ file: f, handle: 'mike', resetCode, newPassword: 'recovered-pw-9' });
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'recovered-pw-9' }), true);
});

test('adminReset can bootstrap an unknown handle (new device) under dev role', () => {
  const f = tmp();
  const { resetCode } = auth.adminReset({ file: f, handle: 'newuser', roleResolver: () => 'dev' });
  auth.resetWithCode({ file: f, handle: 'newuser', resetCode, newPassword: 'fresh-pw-2468' });
  assert.equal(auth.verifyPassword({ file: f, handle: 'newuser', password: 'fresh-pw-2468' }), true);
});
