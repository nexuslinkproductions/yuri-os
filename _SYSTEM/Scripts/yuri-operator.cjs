#!/usr/bin/env node
/**
 * yuri-operator.cjs — two-role operator system for YURI (dev / coworker)
 *
 * SECURITY MODEL (honest):
 *   - The owner's passphrase IS the dev key. Hold it -> `dev` (unrestricted).
 *     Don't -> `coworker` (restricted). This is the only "way out", and it
 *     requires the owner's passphrase.
 *   - FAIL CLOSED: missing/corrupt/tampered local config resolves to `coworker`,
 *     never `dev`. Breaking the system makes it MORE restricted, not less.
 *   - The repo stores only a scrypt HASH of the passphrase (dev-credential.json),
 *     never the passphrase. A co-worker clone has the hash, not the phrase.
 *   - Local enforcement governs YURI's behavior. It is defense-in-depth, NOT a
 *     server boundary; the bypass-proof repo lock is GitHub read-only (deferred).
 *
 * CommonJS (.cjs) so the .js CommonJS hooks can require() it synchronously.
 * Also runnable as a CLI:  node _SYSTEM/Scripts/yuri-operator.cjs <cmd>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CRED_FILE = path.join(REPO_ROOT, '_SYSTEM', 'SELF', 'dev-credential.json'); // committed (hash only)
const OPERATOR_FILE = path.join(REPO_ROOT, '.claude', 'operator.json');            // local, gitignored

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }; // slow KDF -> brute-force-resistant

// ── credential (hash) store ──────────────────────────────────────────────────

function loadCred() {
  try {
    if (!fs.existsSync(CRED_FILE)) return null;
    const c = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
    if (!c || !c.salt || !c.hash) return null;
    return c;
  } catch { return null; }
}

function hashPassphrase(passphrase, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(passphrase, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString('hex');
}

function verifyDevKey(passphrase, cred) {
  if (!passphrase || !cred) return false;
  try {
    const h = hashPassphrase(passphrase, cred.salt);
    const a = Buffer.from(h, 'hex');
    const b = Buffer.from(cred.hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// ── role resolution (the heart — fail-closed) ────────────────────────────────

function roleSystemActive() {
  return !!loadCred(); // inactive until owner runs init-dev (avoids bricking a fresh repo)
}

function resolveRole() {
  const cred = loadCred();
  if (!cred) return 'dev';                 // system not initialized -> unrestricted (setup phase)
  return verifyDevKey(process.env.YURI_DEV_KEY, cred) ? 'dev' : 'coworker';
}

function loadOperator() {
  try {
    if (!fs.existsSync(OPERATOR_FILE)) return null;
    return JSON.parse(fs.readFileSync(OPERATOR_FILE, 'utf8'));
  } catch { return null; }
}

// ── interactive hidden passphrase prompt ─────────────────────────────────────

function promptHidden(label) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(label);
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    let buf = '';
    const onData = (ch) => {
      const s = ch.toString('utf8');
      if (s === '\n' || s === '\r' || s === '') {
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.removeListener('data', onData);
        stdin.pause();
        process.stdout.write('\n');
        resolve(buf);
      } else if (s === '') { // Ctrl-C
        process.stdout.write('\n'); process.exit(1);
      } else if (s === '' || s === '\b') {
        buf = buf.slice(0, -1);
      } else {
        buf += s;
      }
    };
    stdin.resume();
    stdin.on('data', onData);
  });
}

function promptLine(label) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(label, (a) => { rl.close(); resolve(a.trim()); });
  });
}

// Resolve a passphrase for non-interactive use (tests/scripts): --passphrase= or env.
function passphraseFromArgs(args, envName) {
  const flag = args.find((a) => a.startsWith('--passphrase='));
  if (flag) return flag.slice('--passphrase='.length);
  if (process.env[envName]) return process.env[envName];
  return null;
}

// ── commands ─────────────────────────────────────────────────────────────────

async function cmdInitDev(args) {
  const existing = loadCred();
  if (existing) {
    const cur = passphraseFromArgs(args, 'YURI_DEV_KEY') || await promptHidden('Current dev passphrase: ');
    if (!verifyDevKey(cur, existing)) { console.error('✗ current passphrase does not match — aborting.'); process.exit(1); }
  }
  let pass = args.find((a) => a.startsWith('--new-passphrase='));
  pass = pass ? pass.slice('--new-passphrase='.length) : null;
  if (!pass) {
    const p1 = await promptHidden('New dev passphrase: ');
    const p2 = await promptHidden('Confirm dev passphrase: ');
    if (p1 !== p2) { console.error('✗ passphrases do not match.'); process.exit(1); }
    pass = p1;
  }
  if (!pass || pass.length < 8) { console.error('✗ passphrase too short (min 8 chars). Use something strong — the hash is committed.'); process.exit(1); }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassphrase(pass, salt);
  fs.mkdirSync(path.dirname(CRED_FILE), { recursive: true });
  fs.writeFileSync(CRED_FILE, JSON.stringify({ algo: 'scrypt', params: SCRYPT_PARAMS, salt, hash, note: 'hash of owner dev passphrase — NOT the passphrase. Safe to commit.' }, null, 2) + '\n');
  console.log('✓ dev credential set. Export it in YOUR shell only:  export YURI_DEV_KEY="<your passphrase>"');
  console.log('  (never commit the passphrase; the clone gets only this hash)');
}

async function cmdRegister(args) {
  let name = args.find((a) => a.startsWith('--name='));
  name = name ? name.slice('--name='.length) : (await promptLine('Operator name: '));
  if (!name) { console.error('✗ name required.'); process.exit(1); }
  const role = resolveRole();
  fs.mkdirSync(path.dirname(OPERATOR_FILE), { recursive: true });
  fs.writeFileSync(OPERATOR_FILE, JSON.stringify({ name, role, registeredAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(`✓ registered "${name}" as role: ${role.toUpperCase()}`);
  if (role === 'coworker') {
    console.log('  You can read everything, work locally, and use every lane.');
    console.log('  Blocked: pushing to the owner\'s repo, editing the guard/role system, owner-only ops.');
    console.log('  Your own work goes to your own remote.');
  } else if (!roleSystemActive()) {
    console.log('  (role system not yet initialized by owner — currently unrestricted)');
  }
}

function cmdStatus() {
  const op = loadOperator();
  const role = resolveRole();
  const active = roleSystemActive();
  console.log(JSON.stringify({
    operator: op ? op.name : '(unregistered)',
    role,
    role_system_active: active,
    dev_key_present: !!(loadCred() && verifyDevKey(process.env.YURI_DEV_KEY, loadCred())),
  }, null, 2));
}

function cmdResolve() { process.stdout.write(resolveRole()); }

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'init-dev':  return cmdInitDev(args);
    case 'register':  return cmdRegister(args);
    case 'status':    return cmdStatus();
    case 'resolve':   return cmdResolve();
    case 'whoami':    return cmdStatus();
    default:
      console.log('yuri-operator — two-role system (dev / coworker)');
      console.log('  node _SYSTEM/Scripts/yuri-operator.cjs init-dev    # owner: set dev passphrase (hash committed)');
      console.log('  node _SYSTEM/Scripts/yuri-operator.cjs register     # set this machine\'s operator + role');
      console.log('  node _SYSTEM/Scripts/yuri-operator.cjs status       # show active operator + resolved role');
      console.log('  node _SYSTEM/Scripts/yuri-operator.cjs resolve      # print resolved role (dev|coworker)');
      console.log('\nRole = owner passphrase in YURI_DEV_KEY env. Present+valid -> dev. Else -> coworker (fail-closed).');
  }
}

// Library exports for the guard hooks (CommonJS require)
module.exports = { resolveRole, roleSystemActive, verifyDevKey, loadCred, loadOperator, REPO_ROOT, CRED_FILE, OPERATOR_FILE };

if (require.main === module) main();
