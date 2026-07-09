#!/usr/bin/env node
// @capability: mure-auth-seed
// @serves: seed portable auth profiles into MURE role agents | audit role-variant provider auth | keep OAuth in the main agent | prepare native sessions_spawn model overrides
// @does: reads the main OpenClaw agent auth store, copies only portable api_key/token profiles into role-local stores according to each role's catalog models/variants, and reports OAuth/config-provider coverage without exposing credentials
// @use: node _SYSTEM/Scripts/mure-auth-seed.mjs [--apply] [--all-portable] [--agents id,id] [--json]
// @exports: normalizeProvider, requiredProvidersByAgent, auditAuthCoverage
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const CATALOG_PATH = path.join(REPO, '.openclaw', 'mure-agent-catalog.json');
const PORTABLE_TYPES = new Set(['api_key', 'token']);
const APPLY = process.argv.includes('--apply');
const ALL_PORTABLE = process.argv.includes('--all-portable');
const JSON_OUT = process.argv.includes('--json');

function canonicalAuthProvider(provider) {
  return provider === 'claude-cli' ? 'anthropic' : provider;
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

export function normalizeProvider(modelRef) {
  const ref = String(modelRef || '').trim();
  if (!ref) return null;
  if (/^deepseek-v4-(?:pro|flash):direct$/.test(ref)) return 'deepseek';
  if (/^deepseek\/deepseek-v4-(?:pro|flash):direct$/.test(ref)) return 'deepseek';
  if (/^(?:minimax\/)?minimax-m2\.7(?:-highspeed)?:direct$/.test(ref)) return 'minimax-portal';
  if (ref.startsWith('cursor/')) return 'cursor-cli';
  return ref.includes('/') ? ref.split('/')[0] : null;
}

function agentDir(configEntry) {
  return path.resolve(String(configEntry.agentDir || path.join(os.homedir(), '.openclaw', 'agents', configEntry.id, 'agent')).replace(/^~(?=$|\/)/, os.homedir()));
}

function readAuthProfiles(dbPath) {
  if (!fs.existsSync(dbPath)) return {};
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare("SELECT store_json FROM auth_profile_store WHERE store_key = 'primary'").get();
    if (!row?.store_json) return {};
    return JSON.parse(row.store_json).profiles || {};
  } finally {
    db.close();
  }
}

export function requiredProvidersByAgent(catalog) {
  return new Map(catalog.agents.map((agent) => {
    const refs = [agent.model, ...(agent.variants || []).map((v) => v.model)];
    return [agent.name, new Set(refs.map(normalizeProvider).filter(Boolean))];
  }));
}

function globalAuthProviders(config) {
  return new Set(Object.entries(config.models?.providers || {})
    .filter(([, provider]) => provider && (provider.apiKey || provider.token || provider.auth))
    .map(([id]) => id));
}

function selectAgents(config) {
  const requested = new Set((argValue('--agents') || '').split(',').map((x) => x.trim()).filter(Boolean));
  const list = config.agents?.list || [];
  if (!requested.size) return list;
  const chosen = list.filter((a) => requested.has(a.id));
  const missing = [...requested].filter((id) => !list.some((a) => a.id === id));
  if (missing.length) throw new Error(`Unknown agent ids: ${missing.join(', ')}`);
  return chosen;
}

function importPortableProfile(agentId, profileId, profile) {
  const secret = profile.key ?? profile.token;
  if (!secret) throw new Error(`${profileId}: portable profile has no key/token field`);
  const command = profile.type === 'api_key' ? 'paste-api-key' : 'paste-token';
  const args = ['models', 'auth', '--agent', agentId, command, '--provider', profile.provider, '--profile-id', profileId];
  if (profile.type === 'token' && Number.isFinite(profile.expiresAt)) {
    const seconds = Math.floor((profile.expiresAt - Date.now()) / 1000);
    if (seconds <= 0) throw new Error(`${profileId}: token is expired`);
    args.push('--expires-in', `${seconds}s`);
  }
  const result = spawnSync('openclaw', args, { input: `${secret}\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`${agentId}/${profileId}: ${String(result.stderr || result.stdout).trim() || `exit ${result.status}`}`);
}

function portableProfileMatches(existing, source) {
  if (!existing) return false;
  return existing.type === source.type
    && existing.provider === source.provider
    && (existing.key ?? existing.token) === (source.key ?? source.token)
    && (existing.expires ?? existing.expiresAt ?? null) === (source.expires ?? source.expiresAt ?? null);
}

function backupSqlite(dbPath, backupPath) {
  const result = spawnSync('sqlite3', [dbPath, `.backup '${backupPath.replaceAll("'", "''")}'`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`SQLite backup failed for ${dbPath}: ${String(result.stderr || result.stdout).trim()}`);
}

export function auditAuthCoverage({ config, catalog, mainProfiles, selectedAgents = config.agents?.list || [] }) {
  const required = requiredProvidersByAgent(catalog);
  const configProviders = globalAuthProviders(config);
  const mainPortableProviders = new Set(Object.values(mainProfiles).filter((p) => PORTABLE_TYPES.has(p.type)).map((p) => canonicalAuthProvider(p.provider)));
  const mainOAuthProviders = new Set(Object.values(mainProfiles).filter((p) => p.type === 'oauth').map((p) => canonicalAuthProvider(p.provider)));
  const rows = [];

  for (const entry of selectedAgents) {
    const dbPath = path.join(agentDir(entry), 'openclaw-agent.sqlite');
    const localProfiles = readAuthProfiles(dbPath);
    const localProviders = new Set(Object.values(localProfiles).map((p) => p.provider));
    const roleProviders = required.get(entry.id) || new Set([normalizeProvider(entry.model?.primary || entry.model)]);
    const coverage = [...roleProviders].sort().map((provider) => {
      if (localProviders.has(provider)) return { provider, via: 'local-profile' };
      if (mainOAuthProviders.has(provider)) return { provider, via: 'main-oauth-fallback' };
      if (mainPortableProviders.has(provider)) return { provider, via: 'main-portable-available-to-seed' };
      if (configProviders.has(provider)) return { provider, via: 'global-provider-config' };
      return { provider, via: 'missing' };
    });
    rows.push({ agentId: entry.id, requiredProviders: [...roleProviders].sort(), coverage, localProfileIds: Object.keys(localProfiles).sort() });
  }
  return rows;
}

function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const configured = config.agents?.list || [];
  const mainEntry = configured.find((a) => a.default) || configured[0];
  if (!mainEntry) throw new Error('No configured OpenClaw agents');
  const defaultDb = path.join(agentDir(mainEntry), 'openclaw-agent.sqlite');
  const legacyMainDb = path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'openclaw-agent.sqlite');
  // OpenClaw installations that were upgraded from single-agent mode can retain
  // portable profiles in agents/main while the configured default agent owns
  // newer profiles. Runtime auth resolves through both; seed from their union.
  const sourceDbs = [...new Set([legacyMainDb, defaultDb])].filter(fs.existsSync);
  const mainProfiles = Object.assign({}, ...sourceDbs.map(readAuthProfiles));
  const portable = Object.entries(mainProfiles).filter(([, p]) => PORTABLE_TYPES.has(p.type));
  const oauth = Object.entries(mainProfiles).filter(([, p]) => p.type === 'oauth');
  const required = requiredProvidersByAgent(catalog);
  const selected = selectAgents(config);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const actions = [];

  for (const entry of selected) {
    if (entry.id === mainEntry.id) {
      actions.push({ agentId: entry.id, action: 'source-main', profiles: portable.map(([id]) => id) });
      continue;
    }
    const wantedProviders = ALL_PORTABLE
      ? new Set(portable.map(([, p]) => p.provider))
      : (required.get(entry.id) || new Set());
    const targetDb = path.join(agentDir(entry), 'openclaw-agent.sqlite');
    const existing = readAuthProfiles(targetDb);
    const pending = portable.filter(([id, p]) => wantedProviders.has(p.provider) && !portableProfileMatches(existing[id], p));
    const additions = pending.filter(([id]) => !existing[id]).map(([id]) => id);
    const updates = pending.filter(([id]) => existing[id]).map(([id]) => id);
    actions.push({ agentId: entry.id, action: pending.length ? (APPLY ? 'synchronized' : 'would-synchronize') : 'already-covered', additions, updates, profiles: pending.map(([id]) => id) });
    if (!APPLY || !pending.length) continue;

    fs.mkdirSync(path.dirname(targetDb), { recursive: true });
    if (fs.existsSync(targetDb)) backupSqlite(targetDb, `${targetDb}.bak-mure-auth-seed-${stamp}`);
    for (const [id, profile] of pending) importPortableProfile(entry.id, id, profile);
    const after = readAuthProfiles(targetDb);
    const absent = pending.map(([id]) => id).filter((id) => !after[id]);
    if (absent.length) throw new Error(`${entry.id}: profiles missing after import: ${absent.join(', ')}`);
  }

  const coverage = auditAuthCoverage({ config, catalog, mainProfiles, selectedAgents: selected });
  const missing = coverage.flatMap((r) => r.coverage.filter((c) => c.via === 'missing').map((c) => `${r.agentId}:${c.provider}`));
  const report = {
    mode: APPLY ? 'apply' : 'dry-run',
    policy: ALL_PORTABLE ? 'all-portable' : 'role-required-only',
    mainAgent: mainEntry.id,
    sourceStores: sourceDbs,
    portableMainProfiles: portable.map(([id, p]) => ({ id, provider: canonicalAuthProvider(p.provider), type: p.type })),
    oauthMainProfiles: oauth.map(([id, p]) => ({ id, provider: canonicalAuthProvider(p.provider), type: p.type, expiresAt: p.expires ?? p.expiresAt ?? null })),
    actions,
    coverage,
    missing,
    ok: missing.length === 0,
    note: 'Nested catalog variants do not have separate agentDir stores. OAuth profiles stay in the main agent and are consumed through OpenClaw main-agent fallback; never copy OAuth refresh credentials.',
  };

  if (JSON_OUT) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    console.log(`MURE auth seed ${report.mode} (${report.policy}); main=${report.mainAgent}`);
    for (const a of actions) console.log(`${a.agentId}: ${a.action}${a.profiles.length ? ` -> ${a.profiles.join(', ')}` : ''}`);
    console.log(`coverage=${report.ok ? 'complete' : 'missing'}${missing.length ? `: ${missing.join(', ')}` : ''}`);
    console.log(report.note);
  }
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
