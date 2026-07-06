# YURI Active User Data Tracking + Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **YURI routing note:** This is implementation work. After plan approval, the first mutation must run `./_SYSTEM/Scripts/ai route-plan "<task>"` and dispatch to the returned lane (post-plan-dispatch gate). Main thread stays router/verifier/finalizer. `YURI_SPRINT_MODE=1` suppresses the advisory for an authorized sprint.

**Goal:** Stand up the first working external-user contribution loop — every YURI user (Mike first) logs in with their own password, consents, and autonomously contributes privacy-sanitized energy-landscape telemetry to a dedicated data branch that feeds a pulled-into-main improvement backlog — without flooding the repo.

**Architecture:** Build ON the existing Workstream-A energy telemetry (already Codex-PASS): `yuri-energy-trace.mjs` (Privacy Gate v3), `yuri-energy-dispatch-bridge.mjs` (observability hook), `yuri-energy-sanitize.mjs` (Layer-7 three-zone export). Add four new layers: (1) **user identity** — committed roster + local login password/reset; (2) **user attribution** — thread a stable user handle through the trace pipeline, gate-safe; (3) **autonomous export** — a twice-daily launchd collector that sanitizes the gitignored raw trace into one compacted daily file on an orphan `user-data` branch via a git worktree, scoped-commit only; (4) **value loop** — an improvement-backlog analyzer that turns landed data into a pullable list Marcel works into `main` so users get updates.

**Tech Stack:** Node.js (ESM `.mjs` for math/telemetry, CommonJS `.cjs` for guard-requireable identity), `node:crypto` scrypt (mirrors `yuri-operator.cjs`), `node:test` + `node:assert/strict` (the repo's test runner — see `yuri-energy-trace.test.mjs`), git worktrees, launchd `StartCalendarInterval`.

---

## Decision Points (defaults baked in — correct any before building)

| # | Decision | Default chosen | Alternative |
|---|----------|----------------|-------------|
| 1 | Data branch topology | **One orphan `user-data` branch, per-user subdir**, via worktree | Literal branch-per-user (`user-data/mike`) — needs N push grants |
| 2 | Login credential storage | **Local, gitignored** `.claude/user-auth.json` (scrypt hash + reset-code hash) | Committed hash (like `dev-credential.json`) — ships every user's hash |
| 3 | User handle in public artifacts | **Dropped entirely** (`toPublicZone` never copies `user`) | Hashed pseudonym |
| 4 | Real ΔU (action mode) | **Designed + tested but env-gated OFF** — respects the B.1 review gate (2026-06-07..11) per `14-roadmap-what-remains.md` | Enable now (violates the roadmap gate; would fake real-traffic ΔU) |
| 5 | Collection cadence | **2×/day** launchd (02:00, 14:00) | 1×/day |

**Consent is mandatory and load-bearing** — this is real human-subjects data for a research paper. No telemetry attribution without a recorded consent entry. (Phase 0, Task 0.3.)

---

## Scope Check (per writing-plans)

Six build phases below form ONE shippable deliverable: the external-user contribution loop. Each phase produces working, testable software on its own and is independently committable. **Voice/interactive runtime is explicitly out of build scope** — it is "work on later," needs research, and is captured as **Appendix R** (architecture + effort sketch, not TDD tasks). Treat Appendix R as the seed of a separate future plan.

## File Structure (what each new/modified file owns)

**New — identity:**
- `_SYSTEM/Scripts/yuri-user.mjs` — ESM source of truth for the user handle (`currentUserHandle`, `normalizeHandle`). Imported by the telemetry bridge.
- `_SYSTEM/Scripts/yuri-user-roster.cjs` — CLI managing the committed roster `_SYSTEM/SELF/user-roster.json` (identity + consent; **no secrets**).
- `_SYSTEM/Scripts/yuri-user-auth.cjs` — CLI for the per-machine login password + reset code; file `.claude/user-auth.json` (gitignored).

**New — autonomous export:**
- `_SYSTEM/Scripts/yuri-user-data-init.mjs` — one-time orphan `user-data` branch + worktree creation.
- `_SYSTEM/Scripts/yuri-user-data-collect.mjs` — daily collector: raw trace → export projection → worktree → scoped commit.
- `_SYSTEM/Scripts/yuri-improvement-backlog.mjs` — analyze landed data → improvement backlog.
- `_SYSTEM/Scripts/yuri-user-data-cron.sh` — wrapper (no shell operators in plist; see `[[FB:PLIST-XML-WRAPPER-SCRIPTS]]`).
- `_SYSTEM/launchd/com.yuri.user-data.plist` — 2×/day schedule.

**New — onboarding:**
- `_SYSTEM/Scripts/yuri-onboard.cjs` — Mike's first-run bundle (register → consent → password → branch/worktree init → daemon install).

**Modified — telemetry (surgical):**
- `_SYSTEM/Scripts/math/yuri-energy-trace.mjs` — add `'user'` to `ALLOWED_STRING_PATHS`; `buildTraceRecord` accepts + emits `user`.
- `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs` — resolve + pass `user` (no change to the 3 dispatch surfaces — the bridge resolves internally).
- `.gitignore` — add `_SYSTEM/state/user-data-worktree/`, `.claude/user-auth.json`.

**Tests** live beside each source as `*.test.mjs` / `*.test.cjs` (repo convention).

---

# PHASE 0 — User Roster + Consent (identity foundation)

**Ships:** a committed roster of YURI users (Marcel, Mike) with recorded consent, and a stable handle derivation. No telemetry yet.

### Task 0.1: Handle derivation (`yuri-user.mjs`)

**Files:**
- Create: `_SYSTEM/Scripts/yuri-user.mjs`
- Test: `_SYSTEM/Scripts/yuri-user.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// _SYSTEM/Scripts/yuri-user.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, currentUserHandle } from './yuri-user.mjs';

test('normalizeHandle lowercases, strips non-alnum, collapses', () => {
  assert.equal(normalizeHandle('Mike'), 'mike');
  assert.equal(normalizeHandle('  Marcel Spatz '), 'marcelspatz');
  assert.equal(normalizeHandle('J@ke!!'), 'jke');
});

test('normalizeHandle returns empty string for junk input', () => {
  assert.equal(normalizeHandle(null), '');
  assert.equal(normalizeHandle(42), '');
  assert.equal(normalizeHandle('   '), '');
});

test('currentUserHandle prefers YURI_USER env, normalized', () => {
  const prev = process.env.YURI_USER;
  process.env.YURI_USER = 'Mike';
  try { assert.equal(currentUserHandle(), 'mike'); }
  finally { if (prev === undefined) delete process.env.YURI_USER; else process.env.YURI_USER = prev; }
});

test('currentUserHandle returns "" when nothing resolvable', () => {
  const prev = process.env.YURI_USER;
  delete process.env.YURI_USER;
  try {
    // operatorReader injected so the test never touches a real operator.json
    assert.equal(currentUserHandle({ operatorReader: () => null }), '');
  } finally { if (prev !== undefined) process.env.YURI_USER = prev; }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-user.test.mjs`
Expected: FAIL — `Cannot find module './yuri-user.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// _SYSTEM/Scripts/yuri-user.mjs
/**
 * YURI user identity resolver (ESM source of truth).
 * Resolves a stable, gate-safe user handle for telemetry attribution.
 * Priority: YURI_USER env → registered operator name (.claude/operator.json) → ''.
 * Empty string is the anonymous fallback and is always gate-safe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');
const OPERATOR_FILE = path.join(REPO_ROOT, '.claude', 'operator.json');

/** Lowercase, strip to [a-z0-9], return '' on junk. Deterministic + gate-safe. */
export function normalizeHandle(name) {
  if (typeof name !== 'string') return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function defaultOperatorReader() {
  try {
    if (!fs.existsSync(OPERATOR_FILE)) return null;
    return JSON.parse(fs.readFileSync(OPERATOR_FILE, 'utf8'));
  } catch { return null; }
}

/**
 * @param {object} [opts]
 * @param {() => ({name?: string}|null)} [opts.operatorReader] injectable for tests
 * @returns {string} normalized handle, or '' (anonymous)
 */
export function currentUserHandle(opts = {}) {
  const envHandle = normalizeHandle(process.env.YURI_USER ?? '');
  if (envHandle) return envHandle;
  const reader = opts.operatorReader ?? defaultOperatorReader;
  const op = reader();
  return op && typeof op.name === 'string' ? normalizeHandle(op.name) : '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-user.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-user.mjs _SYSTEM/Scripts/yuri-user.test.mjs
git commit -m "feat(users): gate-safe user handle resolver"
```

### Task 0.2: Roster store + add/list/get (`yuri-user-roster.cjs`)

**Files:**
- Create: `_SYSTEM/Scripts/yuri-user-roster.cjs`
- Create (seed, by CLI): `_SYSTEM/SELF/user-roster.json`
- Test: `_SYSTEM/Scripts/yuri-user-roster.test.cjs`

- [ ] **Step 1: Write the failing test**

```javascript
// _SYSTEM/Scripts/yuri-user-roster.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const roster = require('./yuri-user-roster.cjs');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'roster-')), 'user-roster.json');
}

test('addUser creates a normalized entry with no secret fields', () => {
  const f = tmpFile();
  const entry = roster.addUser({ file: f, name: 'Mike', role: 'coworker' });
  assert.equal(entry.handle, 'mike');
  assert.equal(entry.displayName, 'Mike');
  assert.equal(entry.role, 'coworker');
  assert.equal(entry.consent, null); // consent recorded separately
  // hard guarantee: no secret-ish keys ever in a roster entry
  for (const k of Object.keys(entry)) {
    assert.ok(!/pass|hash|secret|key|token/i.test(k), `roster leaked field: ${k}`);
  }
});

test('addUser is idempotent on handle (updates displayName/role, keeps consent)', () => {
  const f = tmpFile();
  roster.addUser({ file: f, name: 'Mike', role: 'coworker' });
  roster.recordConsent({ file: f, handle: 'mike', version: 'v1' });
  const again = roster.addUser({ file: f, name: 'Mike', role: 'dev' });
  assert.equal(again.role, 'dev');
  assert.ok(again.consent && again.consent.version === 'v1', 'consent must survive re-add');
});

test('getUser returns null for unknown handle', () => {
  const f = tmpFile();
  assert.equal(roster.getUser({ file: f, handle: 'ghost' }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-user-roster.test.cjs`
Expected: FAIL — `Cannot find module './yuri-user-roster.cjs'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// _SYSTEM/Scripts/yuri-user-roster.cjs
/**
 * YURI user roster — committed identity + consent registry. NEVER stores secrets.
 * File: _SYSTEM/SELF/user-roster.json  (safe to commit — names + consent only).
 * The login password/reset hashes live in .claude/user-auth.json (gitignored).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_FILE = path.join(REPO_ROOT, '_SYSTEM', 'SELF', 'user-roster.json');

function normalizeHandle(name) {
  return typeof name === 'string' ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}
function loadRoster(file) {
  try { const r = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(r.users) ? r : { version: 1, users: [] }; }
  catch { return { version: 1, users: [] }; }
}
function saveRoster(file, roster) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(roster, null, 2) + '\n');
}

function addUser({ file = DEFAULT_FILE, name, role = 'coworker', dataBranch = 'user-data', isoNow } = {}) {
  const handle = normalizeHandle(name);
  if (!handle) throw new Error('addUser: name yields empty handle');
  const roster = loadRoster(file);
  const existing = roster.users.find((u) => u.handle === handle);
  const now = isoNow ?? new Date().toISOString();
  if (existing) {
    existing.displayName = name;
    existing.role = role;
    existing.updatedAt = now;
    saveRoster(file, roster);
    return existing;
  }
  const entry = { handle, displayName: name, role, dataBranch, dataPath: `${dataBranch}/${handle}`, consent: null, registeredAt: now, updatedAt: now };
  roster.users.push(entry);
  saveRoster(file, roster);
  return entry;
}

function recordConsent({ file = DEFAULT_FILE, handle, version, isoNow } = {}) {
  const roster = loadRoster(file);
  const u = roster.users.find((x) => x.handle === normalizeHandle(handle));
  if (!u) throw new Error(`recordConsent: unknown handle ${handle}`);
  u.consent = { version: String(version), at: isoNow ?? new Date().toISOString() };
  saveRoster(file, roster);
  return u.consent;
}

function getUser({ file = DEFAULT_FILE, handle } = {}) {
  return loadRoster(file).users.find((u) => u.handle === normalizeHandle(handle)) ?? null;
}
function listUsers({ file = DEFAULT_FILE } = {}) { return loadRoster(file).users; }

module.exports = { addUser, recordConsent, getUser, listUsers, normalizeHandle, DEFAULT_FILE };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const argOf = (k) => { const a = rest.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  if (cmd === 'add') console.log(JSON.stringify(addUser({ name: argOf('name'), role: argOf('role') ?? 'coworker' }), null, 2));
  else if (cmd === 'consent') console.log(JSON.stringify(recordConsent({ handle: argOf('handle'), version: argOf('version') ?? 'v1' }), null, 2));
  else if (cmd === 'list') console.log(JSON.stringify(listUsers(), null, 2));
  else if (cmd === 'get') console.log(JSON.stringify(getUser({ handle: argOf('handle') }), null, 2));
  else console.log('yuri-user-roster — add|consent|list|get  (--name= --role= --handle= --version=)');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-user-roster.test.cjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Seed the real roster + commit**

```bash
node _SYSTEM/Scripts/yuri-user-roster.cjs add --name=Marcel --role=dev
node _SYSTEM/Scripts/yuri-user-roster.cjs add --name=Mike --role=coworker
git add _SYSTEM/Scripts/yuri-user-roster.cjs _SYSTEM/Scripts/yuri-user-roster.test.cjs _SYSTEM/SELF/user-roster.json
git commit -m "feat(users): committed roster (identity+consent, no secrets)"
```

### Task 0.3: Consent text + version constant

**Files:**
- Create: `_SYSTEM/SELF/CONSENT.md`
- Modify: `_SYSTEM/Scripts/yuri-user-roster.cjs:1` (add `CONSENT_VERSION` export)
- Test: extend `_SYSTEM/Scripts/yuri-user-roster.test.cjs`

- [ ] **Step 1: Write the failing test (append to existing test file)**

```javascript
test('CONSENT_VERSION is exported and consent text file exists', () => {
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  assert.equal(typeof roster.CONSENT_VERSION, 'string');
  assert.ok(roster.CONSENT_VERSION.length > 0);
  const consentPath = path2.join(roster.DEFAULT_FILE, '..', 'CONSENT.md');
  assert.ok(fs2.existsSync(consentPath), 'CONSENT.md must exist next to roster');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-user-roster.test.cjs`
Expected: FAIL — `roster.CONSENT_VERSION` is `undefined`.

- [ ] **Step 3: Implement — add export + write CONSENT.md**

Add to the `module.exports` line in `yuri-user-roster.cjs`:

```javascript
const CONSENT_VERSION = 'v1';
module.exports = { addUser, recordConsent, getUser, listUsers, normalizeHandle, DEFAULT_FILE, CONSENT_VERSION };
```

Create `_SYSTEM/SELF/CONSENT.md`:

```markdown
# YURI Contributor Consent (v1)

By using YURI you actively contribute to its development and to Marcel Spatz's
energy-landscape research. While you work, YURI records **privacy-sanitized,
numeric-only** telemetry about its own decision gate — never your prompts, file
contents, secrets, or free text. The Privacy Gate (Layer 7) is enforced
mechanically: any free-text field is refused before a record is written.

**What is collected:** per-dispatch gate decisions (accept/reject), the energy
value U and its change ΔU, which component dominated, lane name, a timestamp,
and your chosen handle.

**Where it goes:** a compacted daily file on the `user-data` branch under your
handle's folder. Nothing lands on `main`. You can read every record you produce.

**Why:** to find what frustrates real users early and to gather honest
real-world evidence for the research paper.

**Your control:** stop contributing any time by unsetting
`YURI_ENERGY_OBSERVABILITY` and uninstalling the collector daemon. Ask Marcel
to remove your folder to delete your contributed data.

Typing `I AGREE` at onboarding records consent version v1 with a timestamp in
the roster. No telemetry is attributed to you before that.
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-user-roster.test.cjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-user-roster.cjs _SYSTEM/Scripts/yuri-user-roster.test.cjs _SYSTEM/SELF/CONSENT.md
git commit -m "feat(users): consent text + version constant"
```

---

# PHASE 1 — Login Password + Reset Code (`yuri-user-auth.cjs`)

**Ships:** Mike sets his own login password on first setup; a one-time reset code lets him recover it. Local + gitignored. Independent of the dev key (which governs dev/coworker authority).

### Task 1.1: Auth library — set / verify / reset

**Files:**
- Create: `_SYSTEM/Scripts/yuri-user-auth.cjs`
- Test: `_SYSTEM/Scripts/yuri-user-auth.test.cjs`
- Modify: `.gitignore` (add `.claude/user-auth.json`)

- [ ] **Step 1: Write the failing test**

```javascript
// _SYSTEM/Scripts/yuri-user-auth.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const auth = require('./yuri-user-auth.cjs');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'auth-')), 'user-auth.json');

test('setPassword returns a reset code and persists only hashes', () => {
  const f = tmp();
  const { resetCode } = auth.setPassword({ file: f, handle: 'mike', password: 'correct horse battery' });
  assert.match(resetCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const raw = fs.readFileSync(f, 'utf8');
  assert.ok(!raw.includes('correct horse battery'), 'password must never be persisted');
  assert.ok(!raw.includes(resetCode), 'reset code itself must never be persisted (only its hash)');
});

test('verifyPassword true on match, false on mismatch', () => {
  const f = tmp();
  auth.setPassword({ file: f, handle: 'mike', password: 'pw-one-2-three' });
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'pw-one-2-three' }), true);
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'wrong' }), false);
});

test('resetWithCode rotates password and consumes the code (single use)', () => {
  const f = tmp();
  const { resetCode } = auth.setPassword({ file: f, handle: 'mike', password: 'old-pw-aaaa' });
  const ok = auth.resetWithCode({ file: f, handle: 'mike', resetCode, newPassword: 'new-pw-bbbb' });
  assert.equal(ok.ok, true);
  assert.equal(auth.verifyPassword({ file: f, handle: 'mike', password: 'new-pw-bbbb' }), true);
  // code is now consumed
  assert.throws(() => auth.resetWithCode({ file: f, handle: 'mike', resetCode, newPassword: 'x-pw-cccc' }), /consumed|invalid/i);
});

test('setPassword rejects short passwords', () => {
  const f = tmp();
  assert.throws(() => auth.setPassword({ file: f, handle: 'mike', password: 'short' }), /at least|min/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-user-auth.test.cjs`
Expected: FAIL — `Cannot find module './yuri-user-auth.cjs'`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// _SYSTEM/Scripts/yuri-user-auth.cjs
/**
 * YURI per-machine login password + reset code. Local + gitignored.
 * Mirrors yuri-operator.cjs scrypt discipline. Stores ONLY salted hashes —
 * never the password, never the reset code itself. Separate from the dev key.
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
  const a = Buffer.from(aHex, 'hex'); const b = Buffer.from(bHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function load(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { version: 1, users: {} }; } }
function save(file, db) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 2) + '\n'); }

/** Human-typeable reset code: XXXX-XXXX-XXXX from Crockford-ish alphabet. */
function makeResetCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) { if (i > 0 && i % 4 === 0) s += '-'; s += alphabet[bytes[i] % alphabet.length]; }
  return s;
}

function setPassword({ file = DEFAULT_FILE, handle, password } = {}) {
  if (typeof password !== 'string' || password.length < MIN_PW) throw new Error(`password must be at least ${MIN_PW} chars`);
  const db = load(file);
  const salt = crypto.randomBytes(16).toString('hex');
  const resetSalt = crypto.randomBytes(16).toString('hex');
  const resetCode = makeResetCode();
  db.users[handle] = {
    algo: 'scrypt', params: SCRYPT_PARAMS,
    salt, hash: hash(password, salt),
    resetSalt, resetHash: hash(resetCode, resetSalt), resetConsumed: false,
    setAt: new Date().toISOString(),
  };
  save(file, db);
  return { resetCode }; // returned ONCE to the user; never stored in clear
}

function verifyPassword({ file = DEFAULT_FILE, handle, password } = {}) {
  const u = load(file).users[handle];
  if (!u || typeof password !== 'string') return false;
  try { return eq(hash(password, u.salt), u.hash); } catch { return false; }
}

function resetWithCode({ file = DEFAULT_FILE, handle, resetCode, newPassword } = {}) {
  const db = load(file);
  const u = db.users[handle];
  if (!u) throw new Error('invalid: unknown handle');
  if (u.resetConsumed) throw new Error('invalid: reset code consumed');
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PW) throw new Error(`password must be at least ${MIN_PW} chars`);
  if (!resetCode || !eq(hash(resetCode, u.resetSalt), u.resetHash)) throw new Error('invalid: reset code does not match');
  const salt = crypto.randomBytes(16).toString('hex');
  u.salt = salt; u.hash = hash(newPassword, salt); u.resetConsumed = true; u.resetAt = new Date().toISOString();
  save(file, db);
  return { ok: true };
}

module.exports = { setPassword, verifyPassword, resetWithCode, makeResetCode, DEFAULT_FILE, MIN_PW };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const argOf = (k) => { const a = rest.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  try {
    if (cmd === 'set') console.log(JSON.stringify(setPassword({ handle: argOf('handle'), password: argOf('password') })));
    else if (cmd === 'verify') console.log(verifyPassword({ handle: argOf('handle'), password: argOf('password') }) ? 'ok' : 'deny');
    else if (cmd === 'reset') console.log(JSON.stringify(resetWithCode({ handle: argOf('handle'), resetCode: argOf('code'), newPassword: argOf('password') })));
    else console.log('yuri-user-auth — set|verify|reset (--handle= --password= --code=)');
  } catch (e) { console.error('✗', e.message); process.exit(1); }
}
```

- [ ] **Step 4: Run to verify it passes + ignore the local file**

Run: `node --test _SYSTEM/Scripts/yuri-user-auth.test.cjs`
Expected: PASS (4 tests).

Add to `.gitignore` (under the `.claude/state/...` block near line 40):

```
.claude/user-auth.json
```

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-user-auth.cjs _SYSTEM/Scripts/yuri-user-auth.test.cjs .gitignore
git commit -m "feat(users): per-machine login password + single-use reset code"
```

---

# PHASE 2 — User-Attributed Telemetry (the Lyapunov wiring, multi-user)

**Ships:** every energy-gate trace record now carries a gate-safe `user` handle. This is the "wire Lyapunov into dispatch to gather paper data" step — concretely it makes the **existing** B.1 observability stream **multi-user**, so Marcel's and Mike's usage are distinguishable. Real ΔU (action mode) stays env-gated OFF per Decision 4.

### Task 2.1: Add `user` to the Privacy Gate allow-list

**Files:**
- Modify: `_SYSTEM/Scripts/math/yuri-energy-trace.mjs:48-54` and `:262-281`
- Test: extend `_SYSTEM/Scripts/math/yuri-energy-trace.test.mjs`

- [ ] **Step 1: Write the failing test (append to existing test file)**

```javascript
test('user handle survives the Privacy Gate at root, rejected elsewhere', () => {
  const { validateRecord } = require_or_import; // see note below
});
```

Because the trace module is ESM, append this ESM test instead to `yuri-energy-trace.test.mjs`:

```javascript
import { validateRecord, ALLOWED_STRING_PATHS, buildTraceRecord } from './yuri-energy-trace.mjs';

test('Privacy Gate allows user string at root', () => {
  assert.ok(ALLOWED_STRING_PATHS.has('user'));
  assert.doesNotThrow(() => validateRecord({ user: 'mike', lane: 'shintai' }));
});

test('Privacy Gate still rejects a user string at a nested non-allowed path', () => {
  assert.throws(() => validateRecord({ nested: { user: 'mike' } }), /Privacy Gate/);
});

test('buildTraceRecord emits the user field', () => {
  const r = buildTraceRecord({ lane: 'shintai', runId: 'r1', user: 'mike', stateBefore: {}, stateAfter: {} });
  assert.equal(r.user, 'mike');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs`
Expected: FAIL — `ALLOWED_STRING_PATHS.has('user')` is false; `r.user` is `undefined`.

- [ ] **Step 3: Implement — two surgical edits**

Edit `yuri-energy-trace.mjs` `ALLOWED_STRING_PATHS` (line ~48):

```javascript
const ALLOWED_STRING_PATHS = new Set([
  'timestamp',
  'runId',
  'lane',
  'user',
  'decision',
  'dominantTerm',
]);
```

Edit `buildTraceRecord` signature + return (lines ~241 and ~262). Add `user` param and field:

```javascript
export function buildTraceRecord({
  lane,
  runId,
  user,
  stateBefore,
  stateAfter,
  computeUResult,
  computeDeltaUResult,
  gateProposalResult,
  weights = DEFAULT_WEIGHTS,
  threshold = 0,
  allowOverride = false,
}) {
```

…and in the returned object, directly after `lane: String(lane ?? ''),`:

```javascript
    user: String(user ?? ''),
```

Then thread `user` through `traceGateEvaluation` — add `user` to its destructured params (line ~318) and to the `buildTraceRecord({ ... })` call (line ~338):

```javascript
export function traceGateEvaluation({
  lane,
  runId,
  user,
  stateBefore,
  stateAfter,
  weights = DEFAULT_WEIGHTS,
  threshold = 0,
  allowOverride = false,
  traceOptions = {},
} = {}) {
```

```javascript
  const record = buildTraceRecord({
    lane,
    runId,
    user,
    stateBefore,
    stateAfter,
    computeUResult,
    computeDeltaUResult,
    gateProposalResult: gateResult,
    weights,
    threshold,
    allowOverride,
  });
```

- [ ] **Step 4: Run to verify it passes (full trace suite — no regressions)**

Run: `node --test _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs`
Expected: PASS — existing tests + 3 new. (Existing record consumers ignore the extra field.)

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/math/yuri-energy-trace.mjs _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs
git commit -m "feat(energy): user attribution in trace records (gate-safe)"
```

### Task 2.2: Resolve + pass `user` from the dispatch bridge

**Files:**
- Modify: `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs:26` (import) and `:132-152` (traceDispatchEvent body)
- Test: extend `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs`

- [ ] **Step 1: Write the failing test (append)**

```javascript
import { currentUserHandle } from '../yuri-user.mjs';

test('traceDispatchEvent stamps the resolved user handle into the record', () => {
  withObservabilityOn((dir) => { // existing helper sets env + YURI_STATE_DIR; reuse it
    const prev = process.env.YURI_USER; process.env.YURI_USER = 'Mike';
    try {
      traceDispatchEvent({ lane: 'shintai', runId: 'user-stamp' });
      const file = latestTraceFile(dir); // existing helper in this test file
      const rec = JSON.parse(fs.readFileSync(file, 'utf8').trim().split('\n').pop());
      assert.equal(rec.user, 'mike');
    } finally { if (prev === undefined) delete process.env.YURI_USER; else process.env.YURI_USER = prev; }
  });
});

test('explicit args.user overrides the env-resolved handle', () => {
  withObservabilityOn((dir) => {
    traceDispatchEvent({ lane: 'offload', runId: 'explicit-user', user: 'marcel' });
    const file = latestTraceFile(dir);
    const rec = JSON.parse(fs.readFileSync(file, 'utf8').trim().split('\n').pop());
    assert.equal(rec.user, 'marcel');
  });
});
```

> If `withObservabilityOn`/`latestTraceFile` helpers do not already exist in this test file, add small inline equivalents that set `YURI_ENERGY_OBSERVABILITY=1` and `YURI_STATE_DIR=<tmp>`, call the body, then restore env — mirroring the existing `YURI_ENERGY_OBSERVABILITY=1` tests at lines 104-152.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs`
Expected: FAIL — `rec.user` is `undefined`.

- [ ] **Step 3: Implement — resolve user inside the bridge (surfaces unchanged)**

Add the import at the top of `yuri-energy-dispatch-bridge.mjs` (after line 26):

```javascript
import { currentUserHandle } from '../yuri-user.mjs';
```

In `traceDispatchEvent`, after destructuring `lane, runId, numericContext` (around line 136), add `user` resolution and pass it to `traceGateEvaluation`:

```javascript
    const { lane, runId, numericContext, user } =
      (args && typeof args === 'object') ? args : {};
    const resolvedUser = (typeof user === 'string' && user) ? user : currentUserHandle();
    const ctx = sanitizeNumericContext(numericContext ?? {});
    const stateBefore = buildDispatchState(ctx);
    const stateAfter  = buildDispatchState(ctx);

    traceGateEvaluation({
      lane:  String(lane  ?? ''),
      runId: String(runId ?? ''),
      user:  String(resolvedUser ?? ''),
      stateBefore,
      stateAfter,
    });
```

> Import note: the bridge already imports `{ traceGateEvaluation }`? It currently imports `{ traceGateEvaluation } from './yuri-energy-trace.mjs'` at line 26 — confirm and keep. `currentUserHandle` is the only new import. The error-isolation invariant holds: `currentUserHandle()` is inside the existing try/catch, so a resolver failure still cannot reach the dispatch path.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs`
Expected: PASS — existing 8+ tests + 2 new.

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs
git commit -m "feat(energy): bridge resolves + stamps user handle (surfaces untouched)"
```

### Task 2.3 (GATED — design only this sprint): real-ΔU action-mode hook

**Files:**
- Modify: `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs` (add `buildActionState`, behind `YURI_ENERGY_ACTION_MODE === '1'`)
- Test: `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs`

> **DO NOT enable in any shell this sprint.** The roadmap (`14-roadmap-what-remains.md`, Track 4) gates A.2.b action mode until the B.1 review window (2026-06-07..11). This task only lands the *mechanism*, default-OFF and tested-OFF, so it is ready when the gate opens. Enabling it produces non-zero ΔU; doing so before the review would contaminate the B.1 synthetic-baseline dataset.

- [ ] **Step 1: Write the failing test**

```javascript
test('action mode is OFF by default → ΔU stays 0 even with differing context', () => {
  withObservabilityOn((dir) => {
    delete process.env.YURI_ENERGY_ACTION_MODE;
    traceDispatchEvent({ lane: 'shintai', runId: 'gated-off', numericContext: { verifiedEvidenceCountBefore: 1, verifiedEvidenceCountAfter: 5 } });
    const rec = JSON.parse(fs.readFileSync(latestTraceFile(dir), 'utf8').trim().split('\n').pop());
    assert.equal(rec.deltaU, 0); // gated off → identical synthetic state
  });
});
```

- [ ] **Step 2: Run to verify it fails or passes-trivially**

Run: `node --test _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs`
Expected: PASS already (current code is ΔU=0). This test is the **guard** that locks the gated-OFF behavior so a future edit cannot silently flip it on. Keep it.

- [ ] **Step 3: Add the gated builder (inert until env set)**

In `yuri-energy-dispatch-bridge.mjs`, add a second state builder and branch on the env var inside the existing try (do NOT change the default path):

```javascript
function isActionModeEnabled() { return process.env.YURI_ENERGY_ACTION_MODE === '1'; }

// Distinct before/after only when action mode is explicitly enabled (gated).
function buildActionStates(ctx) {
  const before = buildDispatchState({ verifiedEvidenceCount: ctx.verifiedEvidenceCountBefore ?? 0, evidence_count: ctx.evidence_countBefore ?? 0 });
  const after  = buildDispatchState({ verifiedEvidenceCount: ctx.verifiedEvidenceCountAfter ?? 0, evidence_count: ctx.evidence_countAfter ?? 0 });
  return { before, after };
}
```

Then replace the synthetic-pair construction with a gated branch:

```javascript
    let stateBefore, stateAfter;
    if (isActionModeEnabled()) {
      ({ before: stateBefore, after: stateAfter } = buildActionStates(ctx));
    } else {
      stateBefore = buildDispatchState(ctx);
      stateAfter  = buildDispatchState(ctx); // identical → ΔU = 0 (A.2.a honest)
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs`
Expected: PASS — gated-OFF guard green; default ΔU still 0.

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs
git commit -m "feat(energy): gated action-mode state builder (default+tested OFF; respects B.1 gate)"
```

---

# PHASE 3 — Autonomous Export to the `user-data` Branch

**Ships:** a collector that reads the gitignored raw trace, projects it to a gate-safe export record, compacts it into one daily file, and commits it to the orphan `user-data` branch in a worktree — never touching `main`.

### Task 3.1: Export projection (pure function)

**Files:**
- Create: `_SYSTEM/Scripts/yuri-user-data-collect.mjs` (start with the pure projector + its export)
- Test: `_SYSTEM/Scripts/yuri-user-data-collect.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// _SYSTEM/Scripts/yuri-user-data-collect.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectTraceForExport } from './yuri-user-data-collect.mjs';
import { validateRecord } from './math/yuri-energy-trace.mjs';

const sampleTrace = {
  timestamp: '2026-05-30T10:00:00.000Z', runId: 'shintai-123', lane: 'shintai', user: 'mike',
  U_before: 0, U_after: -1.5, deltaU: -1.5,
  componentContributions: { evidence: -1.0, violations: 0 },
  decision: 'accept', dominantTerm: 'evidence', threshold: 0, weights: { a: 1 },
  stateBefore_summary: { verifiedEvidenceCount: 3 }, advisory_only: true,
};

test('projectTraceForExport keeps only gate-safe export fields', () => {
  const out = projectTraceForExport(sampleTrace);
  assert.deepEqual(Object.keys(out).sort(), [
    'componentContributions', 'decision', 'deltaU', 'dominantTerm',
    'lane', 'timestamp', 'U_after', 'U_before', 'user',
  ].sort());
  assert.doesNotThrow(() => validateRecord(out)); // Privacy Gate must pass
});

test('projectTraceForExport drops unknown/free-text fields (fail-closed)', () => {
  const out = projectTraceForExport({ ...sampleTrace, promptText: 'secret', filePath: '/Users/x' });
  assert.equal(out.promptText, undefined);
  assert.equal(out.filePath, undefined);
});

test('projectTraceForExport coerces non-numeric energy fields to 0', () => {
  const out = projectTraceForExport({ ...sampleTrace, deltaU: 'NaN-ish', U_after: undefined });
  assert.equal(out.deltaU, 0);
  assert.equal(out.U_after, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-user-data-collect.test.mjs`
Expected: FAIL — `Cannot find module './yuri-user-data-collect.mjs'`.

- [ ] **Step 3: Implement the projector (file scaffold)**

```javascript
// _SYSTEM/Scripts/yuri-user-data-collect.mjs
/**
 * Daily collector: gitignored raw energy-trace → gate-safe export records →
 * one compacted daily file on the orphan `user-data` branch (via worktree),
 * scoped-commit only. Never touches main. Allow-list projection (fail-closed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateRecord } from './math/yuri-energy-trace.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function numericMap(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) { const n = Number(v); if (Number.isFinite(n)) out[k] = n; }
  }
  return out;
}

/** Allow-list projection of a raw trace record → export record. Gate-safe. */
export function projectTraceForExport(rec) {
  const src = rec && typeof rec === 'object' ? rec : {};
  const out = {
    timestamp: typeof src.timestamp === 'string' && src.timestamp.includes('T') ? src.timestamp : '',
    lane: typeof src.lane === 'string' ? src.lane : '',
    user: typeof src.user === 'string' ? src.user : '',
    decision: src.decision === 'accept' || src.decision === 'reject' ? src.decision : '',
    dominantTerm: typeof src.dominantTerm === 'string' ? src.dominantTerm : null,
    U_before: num(src.U_before),
    U_after: num(src.U_after),
    deltaU: num(src.deltaU),
    componentContributions: numericMap(src.componentContributions),
  };
  validateRecord(out); // canary — throws if a free-text field smuggled through
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-user-data-collect.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-user-data-collect.mjs _SYSTEM/Scripts/yuri-user-data-collect.test.mjs
git commit -m "feat(user-data): gate-safe export projection (fail-closed allow-list)"
```

### Task 3.2: Read + compact a raw trace file by user

**Files:**
- Modify: `_SYSTEM/Scripts/yuri-user-data-collect.mjs` (add `collectDay`)
- Test: extend `_SYSTEM/Scripts/yuri-user-data-collect.test.mjs`

- [ ] **Step 1: Write the failing test (append)**

```javascript
import fs from 'node:fs';
import os from 'node:os';
import { collectDay } from './yuri-user-data-collect.mjs';

test('collectDay reads a raw jsonl, filters by user, returns projected records', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-'));
  const day = '2026-05-30';
  const lines = [
    { ...sampleTrace, user: 'mike', runId: 'a' },
    { ...sampleTrace, user: 'marcel', runId: 'b' },
    { ...sampleTrace, user: 'mike', runId: 'c' },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, `${day}.jsonl`), lines);
  const out = collectDay({ traceDir: dir, day, user: 'mike' });
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.user === 'mike'));
});

test('collectDay returns [] when the day file is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-'));
  assert.deepEqual(collectDay({ traceDir: dir, day: '2099-01-01', user: 'mike' }), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-user-data-collect.test.mjs`
Expected: FAIL — `collectDay` is not exported.

- [ ] **Step 3: Implement `collectDay`**

```javascript
/** Read one raw trace day, keep records for `user`, return projected export records. */
export function collectDay({ traceDir, day, user }) {
  const file = path.join(traceDir, `${day}.jsonl`);
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let rec; try { rec = JSON.parse(line); } catch { continue; }
    if (typeof rec.user === 'string' && rec.user === user) {
      try { out.push(projectTraceForExport(rec)); } catch { /* drop any record that fails the gate */ }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-user-data-collect.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-user-data-collect.mjs _SYSTEM/Scripts/yuri-user-data-collect.test.mjs
git commit -m "feat(user-data): collectDay reads+filters+projects a raw trace day"
```

### Task 3.3: Branch/worktree init (`yuri-user-data-init.mjs`)

**Files:**
- Create: `_SYSTEM/Scripts/yuri-user-data-init.mjs`
- Modify: `.gitignore` (add `_SYSTEM/state/user-data-worktree/`)
- Test: `_SYSTEM/Scripts/yuri-user-data-init.test.mjs`

- [ ] **Step 1: Write the failing test (runs against a throwaway git repo)**

```javascript
// _SYSTEM/Scripts/yuri-user-data-init.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensureUserDataWorktree } from './yuri-user-data-init.mjs';

function tmpRepo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'udrepo-'));
  const git = (...a) => execFileSync('git', a, { cwd: d });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  fs.writeFileSync(path.join(d, 'README.md'), '# t\n'); git('add', '.'); git('commit', '-qm', 'init');
  return d;
}

test('ensureUserDataWorktree creates an orphan branch + worktree, idempotently', () => {
  const repo = tmpRepo();
  const wt = path.join(repo, '_SYSTEM', 'state', 'user-data-worktree');
  const r1 = ensureUserDataWorktree({ repoRoot: repo, worktreePath: wt, branch: 'user-data' });
  assert.equal(r1.created, true);
  assert.ok(fs.existsSync(path.join(wt, '.git')) || fs.existsSync(wt));
  const branches = execFileSync('git', ['branch', '--list', 'user-data'], { cwd: repo }).toString();
  assert.match(branches, /user-data/);
  // idempotent second call
  const r2 = ensureUserDataWorktree({ repoRoot: repo, worktreePath: wt, branch: 'user-data' });
  assert.equal(r2.created, false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-user-data-init.test.mjs`
Expected: FAIL — `Cannot find module './yuri-user-data-init.mjs'`.

- [ ] **Step 3: Implement**

```javascript
// _SYSTEM/Scripts/yuri-user-data-init.mjs
/**
 * One-time setup of the orphan `user-data` branch and its git worktree.
 * The worktree lives at _SYSTEM/state/user-data-worktree/ (gitignored in main).
 * The collector writes + commits inside the worktree so main is never touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');

function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }); }
function branchExists(repo, branch) {
  try { return git(repo, 'branch', '--list', branch).trim().length > 0; } catch { return false; }
}
function worktreeRegistered(repo, wt) {
  try { return git(repo, 'worktree', 'list', '--porcelain').includes(path.resolve(wt)); } catch { return false; }
}

export function ensureUserDataWorktree({ repoRoot = REPO_ROOT, worktreePath, branch = 'user-data' } = {}) {
  const wt = worktreePath ?? path.join(repoRoot, '_SYSTEM', 'state', 'user-data-worktree');
  if (worktreeRegistered(repoRoot, wt)) return { created: false, worktreePath: wt, branch };

  if (!branchExists(repoRoot, branch)) {
    // Create an orphan branch with a single seed commit, without disturbing the
    // current checkout, by doing the orphan dance inside a fresh worktree add.
    git(repoRoot, 'worktree', 'add', '--detach', wt);
    git(wt, 'checkout', '--orphan', branch);
    git(wt, 'rm', '-rf', '--quiet', '.');
    fs.writeFileSync(path.join(wt, 'README.md'),
      '# YURI user-data branch\n\nSanitized, numeric-only contributor telemetry. One folder per user handle.\nNo prompts, no secrets, no free text. Never merged into main wholesale.\n');
    git(wt, 'add', 'README.md');
    git(wt, 'commit', '-qm', 'chore(user-data): seed orphan data branch');
    return { created: true, worktreePath: wt, branch };
  }
  git(repoRoot, 'worktree', 'add', wt, branch);
  return { created: false, worktreePath: wt, branch };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = ensureUserDataWorktree();
  console.log(JSON.stringify(r, null, 2));
}
```

Add to `.gitignore`:

```
_SYSTEM/state/user-data-worktree/
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-user-data-init.test.mjs`
Expected: PASS (1 test, both branches of idempotency).

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-user-data-init.mjs _SYSTEM/Scripts/yuri-user-data-init.test.mjs .gitignore
git commit -m "feat(user-data): orphan branch + worktree init (idempotent, main untouched)"
```

### Task 3.4: Write + scoped-commit one day into the worktree

**Files:**
- Modify: `_SYSTEM/Scripts/yuri-user-data-collect.mjs` (add `writeDayToWorktree` + `runCollect`)
- Test: extend `_SYSTEM/Scripts/yuri-user-data-collect.test.mjs`

- [ ] **Step 1: Write the failing test (append; uses a throwaway repo + worktree)**

```javascript
import { execFileSync } from 'node:child_process';
import { ensureUserDataWorktree } from './yuri-user-data-init.mjs';
import { writeDayToWorktree } from './yuri-user-data-collect.mjs';

test('writeDayToWorktree writes user/<handle>/<day>.jsonl and commits only that file', () => {
  // build throwaway repo
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'));
  const g = (...a) => execFileSync('git', a, { cwd: repo });
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'README.md'), '# t\n'); g('add', '.'); g('commit', '-qm', 'init');
  const wt = path.join(repo, 'wt');
  ensureUserDataWorktree({ repoRoot: repo, worktreePath: wt, branch: 'user-data' });

  const records = [projectTraceForExport(sampleTrace)];
  const res = writeDayToWorktree({ worktreePath: wt, user: 'mike', day: '2026-05-30', records });
  assert.ok(fs.existsSync(path.join(wt, 'mike', '2026-05-30.jsonl')));
  assert.equal(res.recordCount, 1);
  // the commit touched exactly the one data file
  const show = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: wt }).toString().trim();
  assert.equal(show, 'mike/2026-05-30.jsonl');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-user-data-collect.test.mjs`
Expected: FAIL — `writeDayToWorktree` is not exported.

- [ ] **Step 3: Implement `writeDayToWorktree` + `runCollect`**

```javascript
function gitWt(wt, ...args) { return execFileSync('git', args, { cwd: wt, encoding: 'utf8' }); }

/** Overwrite user/<handle>/<day>.jsonl with the day's records and commit ONLY that file. */
export function writeDayToWorktree({ worktreePath, user, day, records }) {
  const rel = path.join(user, `${day}.jsonl`);
  const abs = path.join(worktreePath, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const body = records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
  fs.writeFileSync(abs, body);
  // pull latest on the data branch so concurrent users don't diverge silently
  try { gitWt(worktreePath, 'add', '--', rel); } catch { /* nothing staged is fine */ }
  const status = gitWt(worktreePath, 'status', '--porcelain', '--', rel).trim();
  if (!status) return { recordCount: records.length, committed: false }; // no change → no empty commit
  gitWt(worktreePath, 'commit', '-qm', `data(${user}): ${day} — ${records.length} records`, '--', rel);
  return { recordCount: records.length, committed: true };
}

/** End-to-end: resolve dirs, collect the day, write+commit. Pure-ish (paths injectable). */
export function runCollect({ traceDir, worktreePath, user, day } = {}) {
  const records = collectDay({ traceDir, day, user });
  if (!records.length) return { recordCount: 0, committed: false, skipped: 'no-records' };
  return writeDayToWorktree({ worktreePath, user, day, records });
}
```

Add `import { execFileSync } from 'node:child_process';` at the top if not already present (Task 3.1 scaffold includes it).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-user-data-collect.test.mjs`
Expected: PASS (6 tests). Note the **scoped-commit guarantee** (`--`-pathspec'd add+commit) — never a `git add .`, satisfying the YURI mutation contract.

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-user-data-collect.mjs _SYSTEM/Scripts/yuri-user-data-collect.test.mjs
git commit -m "feat(user-data): write+scoped-commit a day into the user-data worktree"
```

### Task 3.5: CLI entrypoint for the collector

**Files:**
- Modify: `_SYSTEM/Scripts/yuri-user-data-collect.mjs` (add `import.meta.url` main block)

- [ ] **Step 1: Add the CLI main block (no new test — covered by `runCollect` tests)**

```javascript
import { currentUserHandle } from './yuri-user.mjs';
import { ensureUserDataWorktree } from './yuri-user-data-init.mjs';

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const argOf = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const user = argOf('user', currentUserHandle());
  if (!user) { console.error('✗ no user handle (set YURI_USER or register an operator)'); process.exit(1); }
  const day = argOf('day', new Date().toISOString().slice(0, 10));
  const traceDir = process.env.YURI_STATE_DIR
    ? path.join(process.env.YURI_STATE_DIR, 'energy-trace')
    : path.join(REPO_ROOT, '_SYSTEM', 'state', 'energy-trace');
  const { worktreePath } = ensureUserDataWorktree();
  const res = runCollect({ traceDir, worktreePath, user, day });
  console.log(JSON.stringify({ user, day, ...res }, null, 2));
}
```

- [ ] **Step 2: Smoke-run against real local data (manual verify)**

Run: `node _SYSTEM/Scripts/yuri-user-data-collect.mjs --user=marcel --day=$(date +%F)`
Expected: JSON `{ user: "marcel", day: "…", recordCount: N, committed: true|false }`. If `recordCount: 0`, you have no traces yet for that day — generate one by running any dispatch with `YURI_ENERGY_OBSERVABILITY=1 YURI_USER=marcel`, then re-run.

- [ ] **Step 3: Commit**

```bash
git add _SYSTEM/Scripts/yuri-user-data-collect.mjs
git commit -m "feat(user-data): collector CLI entrypoint"
```

---

# PHASE 4 — Autonomous Scheduler (launchd, 2×/day)

**Ships:** the collector + backlog run twice a day with zero human action, logging to `.claude/state/`.

### Task 4.1: Wrapper script (no shell operators in plist)

**Files:**
- Create: `_SYSTEM/Scripts/yuri-user-data-cron.sh`

- [ ] **Step 1: Write the wrapper** (per `[[FB:PLIST-XML-WRAPPER-SCRIPTS]]` — operators live in the .sh, never the plist)

```bash
#!/usr/bin/env bash
# YURI user-data cron wrapper. Runs the collector then the backlog, sequentially.
# Operators (&&, redirection) live here, never in the plist ProgramArguments.
set -euo pipefail
REPO="/Users/marcelspatz/YURI-OS-MUSUBI"
NODE="/opt/homebrew/bin/node"
cd "$REPO"
export YURI_ENERGY_OBSERVABILITY="${YURI_ENERGY_OBSERVABILITY:-1}"
# YURI_USER must be exported in the user's shell/login env; fall back to operator.json resolution.
"$NODE" "$REPO/_SYSTEM/Scripts/yuri-user-data-collect.mjs" || echo "[cron] collect failed"
"$NODE" "$REPO/_SYSTEM/Scripts/yuri-improvement-backlog.mjs" || echo "[cron] backlog failed"
```

- [ ] **Step 2: Make executable + verify it parses**

Run: `chmod +x _SYSTEM/Scripts/yuri-user-data-cron.sh && bash -n _SYSTEM/Scripts/yuri-user-data-cron.sh && echo OK`
Expected: `OK` (syntax check; `bash -n` does not execute).

- [ ] **Step 3: Commit**

```bash
git add _SYSTEM/Scripts/yuri-user-data-cron.sh
git commit -m "feat(user-data): cron wrapper (operators in .sh, plist-safe)"
```

### Task 4.2: launchd plist (02:00 + 14:00)

**Files:**
- Create: `_SYSTEM/launchd/com.yuri.user-data.plist`

- [ ] **Step 1: Write the plist** (mirrors `com.nudimmud.token-digest.plist` structure; two calendar entries = 2×/day)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.yuri.user-data</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/yuri-user-data-cron.sh</string>
  </array>

  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>14</integer><key>Minute</key><integer>0</integer></dict>
  </array>

  <key>StandardOutPath</key>
  <string>/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/user-data-cron.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/user-data-cron.err</string>

  <key>WorkingDirectory</key>
  <string>/Users/marcelspatz/YURI-OS-MUSUBI</string>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
```

- [ ] **Step 2: Validate the plist**

Run: `plutil -lint _SYSTEM/launchd/com.yuri.user-data.plist`
Expected: `… OK`.

- [ ] **Step 3: Commit** (install is a manual owner step — see Task 6.4 — not auto-loaded)

```bash
git add _SYSTEM/launchd/com.yuri.user-data.plist
git commit -m "feat(user-data): launchd schedule (02:00 + 14:00, 2x/day)"
```

---

# PHASE 5 — Improvement Backlog (the value loop)

**Ships:** the analyzer that turns landed `user-data` into a ranked, pullable backlog — the thing Marcel works into `main` so users get updates.

### Task 5.1: Signal extraction (pure)

**Files:**
- Create: `_SYSTEM/Scripts/yuri-improvement-backlog.mjs`
- Test: `_SYSTEM/Scripts/yuri-improvement-backlog.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// _SYSTEM/Scripts/yuri-improvement-backlog.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSignals } from './yuri-improvement-backlog.mjs';

const recs = [
  { user: 'mike', lane: 'shintai', decision: 'reject', dominantTerm: 'evidence', deltaU: 1.2 },
  { user: 'mike', lane: 'shintai', decision: 'reject', dominantTerm: 'evidence', deltaU: 0.9 },
  { user: 'mike', lane: 'offload', decision: 'accept', dominantTerm: 'evidence', deltaU: -0.5 },
  { user: 'marcel', lane: 'shintai', decision: 'accept', dominantTerm: 'violations', deltaU: -1.0 },
];

test('computeSignals reports per-lane reject rate and dominant friction term', () => {
  const s = computeSignals(recs);
  assert.equal(s.totalRecords, 4);
  assert.equal(s.byLane.shintai.rejectRate, 2 / 3);
  assert.equal(s.topFrictionTerm, 'evidence'); // most common dominantTerm among rejects
});

test('computeSignals is robust to an empty input', () => {
  const s = computeSignals([]);
  assert.equal(s.totalRecords, 0);
  assert.deepEqual(s.byLane, {});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-improvement-backlog.test.mjs`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implement `computeSignals`**

```javascript
// _SYSTEM/Scripts/yuri-improvement-backlog.mjs
/**
 * Improvement backlog analyzer: reads landed user-data export records and turns
 * them into ranked, human-pullable improvement signals. This is the loop that
 * converts contributor telemetry into YURI updates worked into main.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureUserDataWorktree } from './yuri-user-data-init.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');

/** Pure: derive friction signals from a flat list of export records. */
export function computeSignals(records) {
  const byLane = {};
  const rejectTerms = {};
  let total = 0;
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    total++;
    const lane = typeof r.lane === 'string' && r.lane ? r.lane : 'unknown';
    byLane[lane] ??= { total: 0, rejects: 0, rejectRate: 0 };
    byLane[lane].total++;
    if (r.decision === 'reject') {
      byLane[lane].rejects++;
      const t = typeof r.dominantTerm === 'string' && r.dominantTerm ? r.dominantTerm : 'unknown';
      rejectTerms[t] = (rejectTerms[t] ?? 0) + 1;
    }
  }
  for (const lane of Object.keys(byLane)) {
    const l = byLane[lane];
    l.rejectRate = l.total ? l.rejects / l.total : 0;
  }
  const topFrictionTerm = Object.entries(rejectTerms).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { totalRecords: total, byLane, rejectTerms, topFrictionTerm };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-improvement-backlog.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-improvement-backlog.mjs _SYSTEM/Scripts/yuri-improvement-backlog.test.mjs
git commit -m "feat(backlog): friction signal extraction (per-lane reject rate, top term)"
```

### Task 5.2: Load all user-data + render the backlog report

**Files:**
- Modify: `_SYSTEM/Scripts/yuri-improvement-backlog.mjs` (add `loadAllExportRecords`, `renderBacklog`, CLI)
- Test: extend `_SYSTEM/Scripts/yuri-improvement-backlog.test.mjs`

- [ ] **Step 1: Write the failing test (append)**

```javascript
import { renderBacklog } from './yuri-improvement-backlog.mjs';

test('renderBacklog produces a dated markdown with the top friction term and per-lane table', () => {
  const md = renderBacklog(computeSignals(recs), { generatedAt: '2026-05-30T14:00:00.000Z' });
  assert.match(md, /# YURI Improvement Backlog/);
  assert.match(md, /2026-05-30/);
  assert.match(md, /shintai/);
  assert.match(md, /evidence/);
  assert.match(md, /reject/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-improvement-backlog.test.mjs`
Expected: FAIL — `renderBacklog` not exported.

- [ ] **Step 3: Implement loader + renderer + CLI**

```javascript
/** Read every user/<handle>/<day>.jsonl in the worktree into one flat array. */
export function loadAllExportRecords({ worktreePath } = {}) {
  const out = [];
  if (!worktreePath || !fs.existsSync(worktreePath)) return out;
  for (const handle of fs.readdirSync(worktreePath)) {
    const dir = path.join(worktreePath, handle);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try { out.push(JSON.parse(line)); } catch { /* skip */ }
      }
    }
  }
  return out;
}

/** Render a human-pullable markdown backlog from computed signals. */
export function renderBacklog(signals, { generatedAt } = {}) {
  const when = generatedAt ?? new Date().toISOString();
  const lanes = Object.entries(signals.byLane)
    .sort((a, b) => b[1].rejectRate - a[1].rejectRate)
    .map(([lane, l]) => `| ${lane} | ${l.total} | ${l.rejects} | ${(l.rejectRate * 100).toFixed(1)}% |`)
    .join('\n');
  return [
    `# YURI Improvement Backlog`,
    ``,
    `**Generated:** ${when.slice(0, 10)} (${when})`,
    `**Records analyzed:** ${signals.totalRecords}`,
    `**Top friction term (drives most rejections):** ${signals.topFrictionTerm ?? '—'}`,
    ``,
    `## Per-lane gate friction`,
    ``,
    `| lane | dispatches | rejects | reject rate |`,
    `| --- | --- | --- | --- |`,
    lanes || `| (no data) | 0 | 0 | 0% |`,
    ``,
    `## Pull-to-main candidates`,
    ``,
    `- Investigate the lane with the highest reject rate above: is the gate too strict, or is that lane genuinely producing low-evidence proposals?`,
    `- If \`${signals.topFrictionTerm ?? 'a term'}\` dominates rejections, that component's weight or the upstream behavior is the highest-leverage fix → ship as a user-visible update.`,
    ``,
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { worktreePath } = ensureUserDataWorktree();
  const records = loadAllExportRecords({ worktreePath });
  const signals = computeSignals(records);
  const md = renderBacklog(signals);
  const outDir = path.join(REPO_ROOT, '_SYSTEM', 'reports', 'user-data-backlog');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${new Date().toISOString().slice(0, 10)}-backlog.md`);
  fs.writeFileSync(outFile, md);
  console.log(JSON.stringify({ records: records.length, topFrictionTerm: signals.topFrictionTerm, outFile }, null, 2));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-improvement-backlog.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-improvement-backlog.mjs _SYSTEM/Scripts/yuri-improvement-backlog.test.mjs
git commit -m "feat(backlog): load all user-data + render dated pullable backlog"
```

---

# PHASE 6 — Onboarding Bundle (Mike's first run)

**Ships:** one command that registers Mike, takes consent, sets his password, prints his reset code, inits the data branch, and tells him how to enable collection.

### Task 6.1: Onboarding orchestrator (`yuri-onboard.cjs`)

**Files:**
- Create: `_SYSTEM/Scripts/yuri-onboard.cjs`
- Test: `_SYSTEM/Scripts/yuri-onboard.test.cjs`

- [ ] **Step 1: Write the failing test (non-interactive path with injected inputs)**

```javascript
// _SYSTEM/Scripts/yuri-onboard.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { onboard } = require('./yuri-onboard.cjs');

test('onboard registers, records consent, sets password, returns a reset code', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onb-'));
  const rosterFile = path.join(dir, 'user-roster.json');
  const authFile = path.join(dir, 'user-auth.json');
  const res = onboard({
    name: 'Mike', role: 'coworker', password: 'mike-pw-123456',
    agree: true, rosterFile, authFile, skipBranch: true,
  });
  assert.equal(res.handle, 'mike');
  assert.match(res.resetCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const roster = JSON.parse(fs.readFileSync(rosterFile, 'utf8'));
  const mike = roster.users.find((u) => u.handle === 'mike');
  assert.ok(mike.consent && mike.consent.version === 'v1', 'consent must be recorded');
  assert.ok(!fs.readFileSync(authFile, 'utf8').includes('mike-pw-123456'), 'password never persisted');
});

test('onboard refuses without explicit consent (agree:false)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onb-'));
  assert.throws(() => onboard({
    name: 'Mike', role: 'coworker', password: 'mike-pw-123456', agree: false,
    rosterFile: path.join(dir, 'r.json'), authFile: path.join(dir, 'a.json'), skipBranch: true,
  }), /consent/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test _SYSTEM/Scripts/yuri-onboard.test.cjs`
Expected: FAIL — `Cannot find module './yuri-onboard.cjs'`.

- [ ] **Step 3: Implement**

```javascript
// _SYSTEM/Scripts/yuri-onboard.cjs
/**
 * YURI onboarding bundle. One call wires a new user end to end:
 *   register (roster) → consent → login password (+ reset code) → data branch.
 * Consent is mandatory and load-bearing — no telemetry attribution without it.
 */
'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const roster = require('./yuri-user-roster.cjs');
const auth = require('./yuri-user-auth.cjs');

function onboard({ name, role = 'coworker', password, agree, rosterFile, authFile, skipBranch = false } = {}) {
  if (agree !== true) throw new Error('consent required: user must agree to the contributor consent (v1) before onboarding');
  const entry = roster.addUser({ file: rosterFile ?? roster.DEFAULT_FILE, name, role });
  roster.recordConsent({ file: rosterFile ?? roster.DEFAULT_FILE, handle: entry.handle, version: roster.CONSENT_VERSION });
  const { resetCode } = auth.setPassword({ file: authFile ?? auth.DEFAULT_FILE, handle: entry.handle, password });
  if (!skipBranch) {
    // best-effort branch/worktree init; never blocks onboarding on a git hiccup
    try {
      execFileSync('node', [path.join(__dirname, 'yuri-user-data-init.mjs')], { stdio: 'ignore' });
    } catch { /* surfaced in the printed next-steps instead */ }
  }
  return { handle: entry.handle, role: entry.role, consent: roster.CONSENT_VERSION, resetCode };
}

module.exports = { onboard };

if (require.main === module) {
  const readline = require('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));
  (async () => {
    console.log('\n=== YURI onboarding ===\n');
    const name = await ask('Your name (e.g. Mike): ');
    console.log(`\nPlease read the contributor consent: _SYSTEM/SELF/CONSENT.md`);
    const agreeStr = await ask('Type "I AGREE" to consent to sanitized telemetry contribution: ');
    const password = await ask('Set your YURI login password (min 10 chars): ');
    rl.close();
    try {
      const res = onboard({ name, role: 'coworker', password, agree: agreeStr.trim().toUpperCase() === 'I AGREE' });
      console.log(`\n✓ Welcome, ${name}. You are handle "${res.handle}" (role: ${res.role}).`);
      console.log(`\n⚠ SAVE YOUR RESET CODE — shown once, never stored in clear:\n\n    ${res.resetCode}\n`);
      console.log('To start contributing, add to your ~/.zshrc:');
      console.log(`    export YURI_USER="${res.handle}"`);
      console.log('    export YURI_ENERGY_OBSERVABILITY=1');
      console.log('Then install the 2x/day collector (owner step): see _SYSTEM/launchd/com.yuri.user-data.plist\n');
    } catch (e) { console.error('✗ onboarding failed:', e.message); process.exit(1); }
  })();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test _SYSTEM/Scripts/yuri-onboard.test.cjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add _SYSTEM/Scripts/yuri-onboard.cjs _SYSTEM/Scripts/yuri-onboard.test.cjs
git commit -m "feat(users): onboarding bundle (register+consent+password+branch)"
```

### Task 6.2: Full suite green + wire into `ai` help (discoverability)

**Files:**
- Modify: `_SYSTEM/Scripts/ai` (add an `onboard` passthrough — confirm the dispatcher's command table first; this is the only edit to an existing dispatcher)

- [ ] **Step 1: Run the entire new+touched suite**

Run:
```bash
node --test \
  _SYSTEM/Scripts/yuri-user.test.mjs \
  _SYSTEM/Scripts/yuri-user-roster.test.cjs \
  _SYSTEM/Scripts/yuri-user-auth.test.cjs \
  _SYSTEM/Scripts/yuri-user-data-collect.test.mjs \
  _SYSTEM/Scripts/yuri-user-data-init.test.mjs \
  _SYSTEM/Scripts/yuri-improvement-backlog.test.mjs \
  _SYSTEM/Scripts/yuri-onboard.test.cjs \
  _SYSTEM/Scripts/math/yuri-energy-trace.test.mjs \
  _SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.test.mjs
```
Expected: all PASS, zero fail.

- [ ] **Step 2: Add `onboard` to the `ai` dispatcher** (read `_SYSTEM/Scripts/ai` first; it is bash — see `[[FB:SCRIPTS-AI-IS-BASH]]`. Add a case that execs `node _SYSTEM/Scripts/yuri-onboard.cjs`. Exact lines depend on the existing case table; match the surrounding style.)

- [ ] **Step 3: Verify the alias**

Run: `./_SYSTEM/Scripts/ai onboard </dev/null || true`
Expected: the onboarding prompt header prints (it will exit on empty stdin — that's fine for the smoke check).

- [ ] **Step 4: Commit**

```bash
git add _SYSTEM/Scripts/ai
git commit -m "feat(users): ai onboard passthrough"
```

### Task 6.3: GitNexus impact + change detection (pre-handoff gate)

- [ ] **Step 1: Impact-check the one shared symbol you modified**

Run (MCP): `gitnexus_impact({ target: "buildTraceRecord", direction: "upstream" })` and `gitnexus_impact({ target: "traceDispatchEvent", direction: "upstream" })`.
Expected: report blast radius. The only upstream callers are the 3 dispatch surfaces + tests; the added field is additive (existing consumers ignore it). If risk is HIGH/CRITICAL, STOP and report before continuing.

- [ ] **Step 2: Detect changes before any commit batch**

Run (MCP): `gitnexus_detect_changes()`.
Expected: changed symbols limited to the new files + `buildTraceRecord`/`traceGateEvaluation`/`traceDispatchEvent`. Anything unexpected → investigate.

### Task 6.4: Codex final-pass handoff (verification, not self-certification)

- [ ] **Step 1: Assemble the final-pass packet** under `_SYSTEM/reports/claude-output-lane/` with: task summary, files changed, exact test output from Task 6.2, protected-path + secret-surface checks (confirm `user-auth.json` gitignored, no password/reset-code persisted in clear, roster has no secret fields), and the GitNexus impact/detect results.

- [ ] **Step 2: Dispatch to Codex/main** (security + routing change → escalate per the bridge rule):

```bash
node _SYSTEM/Scripts/claude-codex-final-pass.mjs --packet <packet-path> --execute --model codex --reasoning max
```

- [ ] **Step 3:** Status stays `PENDING_CODEX_MAIN_ARBITRATION` until Codex verifies local evidence. Owner installs the launchd job manually (owner step — coworker push/owner-surface ops are guard-blocked):

```bash
cp _SYSTEM/launchd/com.yuri.user-data.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.yuri.user-data.plist
```

> Per `[[FB:CODEX-SANDBOX-LIMITS]]`, `~/Library/LaunchAgents/` writes are owner/main-thread only — never dispatched into the Codex sandbox.

---

## Self-Review (run against the brain dump)

**Spec coverage map:**

| Brain-dump ask | Covered by |
|---|---|
| Active user data tracking for Mike | Phases 2–3 (attribution + export) |
| Only sanitized data may be pushed to repo | Layer-7 projection (Task 3.1) + Privacy Gate v3 |
| Personalised roster with user name (Mike) | Phase 0 (roster, `displayName`) |
| Autonomous, no flooding, 1–2×/day reports | Phase 4 (2×/day launchd, one compacted file/day) |
| "We manage the registry somehow" | Committed `user-roster.json` + CLI (Task 0.2) |
| Separate branch per user for data | Decision 1: orphan `user-data` branch + per-user subdir (challenged) |
| Backlog of pullable info → worked into main → users get updates | Phase 5 (improvement backlog) |
| Lyapunov / math wired into dispatch for the paper | Phase 2 (user-attributed trace) + Task 2.3 (gated real-ΔU) |
| Users aware they're contributing (consent) | Task 0.3 + mandatory consent gate in onboarding (Task 6.1) |
| Password set + reset code on first setup | Phase 1 + onboarding (Task 6.1) |
| Voice/interactive runtime | **Appendix R** (research, out of build scope) |

**Placeholder scan:** none — every code step carries runnable code; every run step carries an exact command + expected output.

**Type/name consistency:** `currentUserHandle`/`normalizeHandle` (yuri-user.mjs) used identically in bridge + collector; `projectTraceForExport`/`collectDay`/`writeDayToWorktree`/`runCollect` consistent across Tasks 3.1–3.5; `ensureUserDataWorktree` signature `{ repoRoot, worktreePath, branch }` identical in init + collector + backlog; `computeSignals`/`renderBacklog`/`loadAllExportRecords` consistent in Phase 5; roster `addUser`/`recordConsent`/`CONSENT_VERSION` and auth `setPassword`/`verifyPassword`/`resetWithCode` consistent across Phase 0/1/6.

**Adversarial residual risks (carry into Codex handoff):**
1. **Concurrent worktree commits** if Marcel + Mike both run on the same machine/clone — mitigated by per-user file paths (no shared file) + scoped `--`-pathspec commits, but cross-machine merge of the data branch is a future step (Phase 7, not in scope).
2. **`user` handle is light PII** in the sanitized zone. It never reaches the public zone (Decision 3) and consent covers it — but if a public artifact is ever derived, confirm it routes through `toPublicZone` (which drops it).
3. **launchd `YURI_USER` inheritance** — the daemon runs in launchd's env, not the login shell. Task 4.1 falls back to operator.json resolution; verify the operator is registered before relying on the daemon (onboarding registers it).

---

## Appendix R — Voice / Interactive Runtime (research, NOT a build)

The brain dump's second thread — JARVIS-style free-speech interaction with a personal "end of transmission" trigger and real-time re-phrasing. **Out of build scope** (you said "work on later"); captured here as the seed of a separate plan.

**The core problem decoded:** Claude Code's built-in voice does speech→text→submit. You want speech→**continuous buffer**→*you* decide when it's a complete thought→submit. The missing piece is a **turn-completion boundary you control**, not the STT.

**Three viable architectures (rough effort):**

1. **Wrapper-light (days):** a small local process that captures mic → streaming STT (whisper.cpp local, or a cloud STT) → accumulates a transcript buffer → only emits to Claude Code's stdin/IDE input when it hears the personalized trigger phrase ("end of transmission", per-user configurable). Re-phrasing solved trivially: the buffer is editable until the trigger; saying "scratch that" / a configured undo-word clears the last segment. No premature answering because nothing is submitted until the trigger. This is the highest-leverage MVP and reuses your existing per-user handle for the trigger personalization.

2. **VSCode extension (1–2 weeks):** the wrapper as a proper extension — push-to-talk or wake-word, live transcript in a panel you can see and edit before it commits, then injects into the Claude Code input. More polished, more surface area.

3. **Full duplex / barge-in (weeks+, research):** true conversational turn-taking with VAD-based endpointing and interruption handling — the "feels alive" tier. This is the genuinely hard, research-grade piece (endpointing that distinguishes "thinking pause" from "done") and should not gate the MVP.

**Recommendation:** build Architecture 1 first — it solves your stated pain (no premature answers, per-user trigger, real-time re-phrasing) in days, plugs into Claude Code without an IDE, and the trigger word reuses the user-handle system this plan builds. Spin it into its own plan once the data loop here is shipped.

---

## Execution Handoff

Plan complete and saved to `_SYSTEM/reports/claude-output-lane/plans/2026-05-30-user-data-tracking-and-onboarding.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration. Within YURI this means dispatching each task through `./_SYSTEM/Scripts/ai route-plan "<task>"` → returned lane, with the main thread verifying between tasks. Respects the post-plan-dispatch gate.

**2. Inline Execution** — execute tasks in this session with checkpoints for review.

Either way: Phases gate cleanly. Recommended order is 0→1→2→3→4→5→6. Phase 2 is the highest-value single phase (it makes the existing energy stream multi-user — the actual paper unlock) and Phase 0 is its only hard dependency. **Which approach?**
