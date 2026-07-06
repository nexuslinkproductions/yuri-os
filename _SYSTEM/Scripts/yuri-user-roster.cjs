#!/usr/bin/env node
/**
 * YURI user roster — committed identity + consent registry (USER TRAITS store).
 *
 * File: `_SYSTEM/SELF/user-roster.json` — safe to commit (names + consent only).
 * NEVER stores secrets. The login password / reset hashes live in the local,
 * gitignored `.claude/user-auth.json` (separate module).
 *
 * Keyed by `githubId` (the stable userId). The handle is derived once via
 * `normalizeHandle(githubId)`. See `_SYSTEM/docs/user-data-methodology.md` §1 P3/P4.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_FILE = path.join(REPO_ROOT, '_SYSTEM', 'SELF', 'user-roster.json');
const CONSENT_VERSION = 'v1';

function normalizeHandle(name) {
  return typeof name === 'string' ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function loadRoster(file) {
  try {
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(r.users) ? r : { version: 1, users: [] };
  } catch { return { version: 1, users: [] }; }
}

function saveRoster(file, roster) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(roster, null, 2) + '\n');
}

function addUser({ file = DEFAULT_FILE, githubId, displayName, handle, role = 'coworker', dataBranch = 'user-data', isoNow } = {}) {
  // githubId is the immutable identity ANCHOR (exact-string dedup key).
  if (!githubId || !normalizeHandle(githubId)) throw new Error('addUser: githubId required (stable identity anchor)');
  // handle is the gate-safe telemetry LABEL — friendly + stable, set once.
  // Defaults from an explicit handle, else displayName, else the githubId.
  const resolvedHandle = normalizeHandle(handle ?? displayName ?? githubId);
  if (!resolvedHandle) throw new Error('addUser: handle/displayName yields empty handle');
  const roster = loadRoster(file);
  const now = isoNow ?? new Date().toISOString();
  const existing = roster.users.find((u) => u.githubId === githubId);
  if (existing) {
    if (displayName !== undefined) existing.displayName = displayName;
    if (handle !== undefined) existing.handle = resolvedHandle; // only change handle when explicitly given (stability)
    existing.role = role;
    existing.updatedAt = now;
    saveRoster(file, roster);
    return existing;
  }
  const entry = {
    githubId,
    handle: resolvedHandle,
    displayName: displayName ?? githubId,
    role,
    dataBranch,
    dataPath: `${dataBranch}/${resolvedHandle}`,
    consent: null,
    registeredAt: now,
    updatedAt: now,
  };
  roster.users.push(entry);
  saveRoster(file, roster);
  return entry;
}

function recordConsent({ file = DEFAULT_FILE, githubId, version, isoNow } = {}) {
  const roster = loadRoster(file);
  const u = roster.users.find((x) => x.githubId === githubId);
  if (!u) throw new Error(`recordConsent: unknown githubId ${githubId}`);
  u.consent = { version: String(version), at: isoNow ?? new Date().toISOString() };
  saveRoster(file, roster);
  return u.consent;
}

function getUser({ file = DEFAULT_FILE, githubId } = {}) {
  return loadRoster(file).users.find((u) => u.githubId === githubId) ?? null;
}

function listUsers({ file = DEFAULT_FILE } = {}) { return loadRoster(file).users; }

module.exports = { addUser, recordConsent, getUser, listUsers, normalizeHandle, DEFAULT_FILE, CONSENT_VERSION };

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  const argOf = (k) => { const a = rest.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  if (cmd === 'add') console.log(JSON.stringify(addUser({ githubId: argOf('githubId'), displayName: argOf('displayName'), handle: argOf('handle') ?? undefined, role: argOf('role') ?? 'coworker' }), null, 2));
  else if (cmd === 'consent') console.log(JSON.stringify(recordConsent({ githubId: argOf('githubId'), version: argOf('version') ?? CONSENT_VERSION }), null, 2));
  else if (cmd === 'list') console.log(JSON.stringify(listUsers(), null, 2));
  else if (cmd === 'get') console.log(JSON.stringify(getUser({ githubId: argOf('githubId') }), null, 2));
  else console.log('yuri-user-roster — add|consent|list|get  (--githubId= --displayName= --role= --version=)');
}
