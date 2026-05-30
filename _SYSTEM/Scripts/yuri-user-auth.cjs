#!/usr/bin/env node
/**
 * YURI per-machine login password + single-use reset code.
 *
 * Local + gitignored: `.claude/user-auth.json`. Mirrors `yuri-operator.cjs`
 * scrypt discipline. Stores ONLY salted hashes — never the password, never the
 * reset code itself. Separate from the dev key (which governs dev/coworker
 * authority). See `_SYSTEM/docs/user-data-methodology.md`.
 *
 *   setPassword   → set a login password, returns a reset code ONCE
 *   verifyPassword→ check a login attempt
 *   resetWithCode → rotate password using the (single-use) reset code
 *   adminReset    → DEV-ONLY: re-issue a reset code for a user who lost theirs
 *                   or switched devices (the owner's recovery lever)
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_FILE = path.join(REPO_ROOT, '.claude', 'user-auth.json');
const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const MIN_PW = 10;

function hash(secret, saltHex) {
  return crypto.scryptSync(secret, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN, SCRYPT_PARAMS).toString('hex');
}
function eq(aHex, bHex) {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function load(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { version: 1, users: {} }; }
}
function save(file, db) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(db, null, 2) + '\n');
}

/** Human-typeable reset code XXXX-XXXX-XXXX (Crockford-ish, no ambiguous chars). */
function makeResetCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) s += '-';
    s += alphabet[bytes[i] % alphabet.length];
  }
  return s;
}

/** Arm a fresh single-use reset code on a record; returns the clear code. */
function armResetCode(record) {
  const resetSalt = crypto.randomBytes(16).toString('hex');
  const resetCode = makeResetCode();
  record.resetSalt = resetSalt;
  record.resetHash = hash(resetCode, resetSalt);
  record.resetConsumed = false;
  return resetCode;
}

function setPassword({ file = DEFAULT_FILE, handle, password } = {}) {
  if (!handle) throw new Error('setPassword: handle required');
  if (typeof password !== 'string' || password.length < MIN_PW) {
    throw new Error(`password must be at least ${MIN_PW} chars`);
  }
  const db = load(file);
  const salt = crypto.randomBytes(16).toString('hex');
  const record = { algo: 'scrypt', params: SCRYPT_PARAMS, salt, hash: hash(password, salt), setAt: new Date().toISOString() };
  const resetCode = armResetCode(record);
  db.users[handle] = record;
  save(file, db);
  return { resetCode }; // returned ONCE; only its hash is persisted
}

function verifyPassword({ file = DEFAULT_FILE, handle, password } = {}) {
  const u = load(file).users[handle];
  if (!u || !u.hash || typeof password !== 'string') return false;
  try { return eq(hash(password, u.salt), u.hash); } catch { return false; }
}

function resetWithCode({ file = DEFAULT_FILE, handle, resetCode, newPassword } = {}) {
  const db = load(file);
  const u = db.users[handle];
  if (!u) throw new Error('invalid: unknown handle');
  if (u.resetConsumed) throw new Error('invalid: reset code consumed');
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PW) {
    throw new Error(`password must be at least ${MIN_PW} chars`);
  }
  if (!resetCode || !u.resetHash || !eq(hash(resetCode, u.resetSalt), u.resetHash)) {
    throw new Error('invalid: reset code does not match');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  u.salt = salt;
  u.hash = hash(newPassword, salt);
  u.resetConsumed = true;
  u.resetAt = new Date().toISOString();
  save(file, db);
  return { ok: true };
}

/**
 * DEV-ONLY recovery. Re-issues a single-use reset code for `handle` (creating a
 * password-less stub if the user does not exist yet on this machine), so the
 * owner can hand it to a user who lost their password or switched devices. The
 * user then runs resetWithCode to set a new password. Gated on the resolved
 * operator role being `dev`. `roleResolver` is injectable for tests.
 */
function adminReset({ file = DEFAULT_FILE, handle, roleResolver } = {}) {
  if (!handle) throw new Error('adminReset: handle required');
  const resolve = roleResolver ?? (() => {
    try { return require('./yuri-operator.cjs').resolveRole(); } catch { return 'coworker'; }
  });
  if (resolve() !== 'dev') throw new Error('adminReset: dev role required');
  const db = load(file);
  let u = db.users[handle];
  if (!u) { u = { algo: 'scrypt', params: SCRYPT_PARAMS, salt: null, hash: null, setAt: null }; db.users[handle] = u; }
  const resetCode = armResetCode(u);
  u.adminResetAt = new Date().toISOString();
  save(file, db);
  return { resetCode };
}

module.exports = { setPassword, verifyPassword, resetWithCode, adminReset, makeResetCode, DEFAULT_FILE, MIN_PW };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const argOf = (k) => { const a = rest.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  try {
    if (cmd === 'set') console.log(JSON.stringify(setPassword({ handle: argOf('handle'), password: argOf('password') })));
    else if (cmd === 'verify') console.log(verifyPassword({ handle: argOf('handle'), password: argOf('password') }) ? 'ok' : 'deny');
    else if (cmd === 'reset') console.log(JSON.stringify(resetWithCode({ handle: argOf('handle'), resetCode: argOf('code'), newPassword: argOf('password') })));
    else if (cmd === 'admin-reset') console.log(JSON.stringify(adminReset({ handle: argOf('handle') })));
    else console.log('yuri-user-auth — set|verify|reset|admin-reset  (--handle= --password= --code=)');
  } catch (e) { console.error('✗', e.message); process.exit(1); }
}
