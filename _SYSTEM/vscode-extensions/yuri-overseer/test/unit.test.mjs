// Unit tests for the yuri-overseer auth helpers + the CLI worker-resolution logic.
// Pure logic only — no VS Code host, no live extension. Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chooseWorker, recentSessions, slugifyRepo, projectDirFor } from '../../../Scripts/inject-worker.mjs';

const require = createRequire(import.meta.url);
const { timingSafeEqualStr, localOriginOk, authed } = require('../auth.cjs');

const HOST = '127.0.0.1';
const PORT = 7771;
const req = (headers) => ({ headers });

// ── auth: timingSafeEqualStr ──────────────────────────────────────────────
test('timingSafeEqualStr: equal strings → true', () => {
  assert.equal(timingSafeEqualStr('abc123', 'abc123'), true);
});
test('timingSafeEqualStr: different same-length → false', () => {
  assert.equal(timingSafeEqualStr('abc123', 'abc124'), false);
});
test('timingSafeEqualStr: length mismatch → false (no throw)', () => {
  assert.equal(timingSafeEqualStr('abc', 'abcdef'), false);
});

// ── auth: authed ──────────────────────────────────────────────────────────
test('authed: correct bearer → true', () => {
  assert.equal(authed(req({ authorization: 'Bearer secret-token' }), 'secret-token'), true);
});
test('authed: wrong bearer → false', () => {
  assert.equal(authed(req({ authorization: 'Bearer nope' }), 'secret-token'), false);
});
test('authed: missing header → false', () => {
  assert.equal(authed(req({}), 'secret-token'), false);
});
test('authed: empty server token → false even if header matches empty', () => {
  assert.equal(authed(req({ authorization: 'Bearer ' }), ''), false);
});
test('authed: case-insensitive Bearer scheme', () => {
  assert.equal(authed(req({ authorization: 'bearer secret-token' }), 'secret-token'), true);
});

// ── auth: localOriginOk ───────────────────────────────────────────────────
test('localOriginOk: matching host, no origin → true', () => {
  assert.equal(localOriginOk(req({ host: `${HOST}:${PORT}` }), HOST, PORT), true);
});
test('localOriginOk: localhost host alias → true', () => {
  assert.equal(localOriginOk(req({ host: `localhost:${PORT}` }), HOST, PORT), true);
});
test('localOriginOk: wrong host → false (DNS-rebind guard)', () => {
  assert.equal(localOriginOk(req({ host: 'evil.example.com' }), HOST, PORT), false);
});
test('localOriginOk: local origin present → true', () => {
  assert.equal(localOriginOk(req({ host: `${HOST}:${PORT}`, origin: 'http://127.0.0.1:5500' }), HOST, PORT), true);
});
test('localOriginOk: remote origin → false', () => {
  assert.equal(localOriginOk(req({ host: `${HOST}:${PORT}`, origin: 'https://evil.example.com' }), HOST, PORT), false);
});

// ── CLI: slugifyRepo / projectDirFor ──────────────────────────────────────
test('slugifyRepo: slashes and dots → dashes', () => {
  assert.equal(slugifyRepo('/Users/marcelspatz/YURI-OS-MUSUBI'), '-Users-marcelspatz-YURI-OS-MUSUBI');
});
test('projectDirFor: joins projects root + slug', () => {
  assert.equal(
    projectDirFor('/Users/m/repo', '/home/.claude/projects'),
    '/home/.claude/projects/-Users-m-repo',
  );
});

// ── CLI: chooseWorker resolution order ────────────────────────────────────
const sessions = [
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', mtime: 300 }, // newest
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', mtime: 200 },
  { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', mtime: 100 },
];
test('chooseWorker: explicit flag wins over everything', () => {
  assert.equal(chooseWorker({ explicit: 'EXPLICIT', workerIdFile: 'FILE', overseerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', sessions }), 'EXPLICIT');
});
test('chooseWorker: worker.id file beats transcript derivation', () => {
  assert.equal(chooseWorker({ explicit: '', workerIdFile: 'FILE', overseerId: '', sessions }), 'FILE');
});
test('chooseWorker: derive newest non-overseer transcript', () => {
  // overseer = newest (aaaa) → worker should be next newest (bbbb), NOT the overseer.
  assert.equal(
    chooseWorker({ explicit: '', workerIdFile: '', overseerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', sessions }),
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  );
});
test('chooseWorker: no sessions → empty string', () => {
  assert.equal(chooseWorker({ explicit: '', workerIdFile: '', overseerId: '', sessions: [] }), '');
});
test('chooseWorker: overseer is the only session → empty (never targets itself)', () => {
  assert.equal(
    chooseWorker({ explicit: '', workerIdFile: '', overseerId: 'only', sessions: [{ id: 'only', mtime: 1 }] }),
    '',
  );
});

// ── CLI: recentSessions filtering (mocked fs) ─────────────────────────────
test('recentSessions: filters non-uuid + stale, sorts newest-first', () => {
  const now = 1_000_000;
  const fsImpl = {
    readdirSync: () => [
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl', // fresh
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jsonl', // fresh, older
      'cccccccc-cccc-cccc-cccc-cccccccccccc.jsonl', // STALE
      'not-a-uuid.jsonl',                            // ignored
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.meta.json', // ignored (not .jsonl)
    ],
    statSync: (p) => {
      if (p.includes('aaaaaaaa')) return { mtimeMs: now - 1000 };
      if (p.includes('bbbbbbbb')) return { mtimeMs: now - 5000 };
      if (p.includes('cccccccc')) return { mtimeMs: now - 60 * 60 * 1000 }; // 1h old → stale
      return { mtimeMs: now };
    },
  };
  const got = recentSessions('/x', { now, maxAgeMs: 30 * 60 * 1000, fsImpl });
  assert.deepEqual(got.map((s) => s.id), [
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  ]);
});
