#!/usr/bin/env node
// security/osv-lookup.mjs — known-vulnerable dependency lookup for the skill-security gate.
//
// CLEAN-ROOM, node builtins ONLY. Matches a foreign skill's declared dependencies against an
// OFFLINE OSV/CVE snapshot (DEFAULT). With --osv-online it queries OSV.dev and FAILS SOFT to the
// offline snapshot on any timeout / network error / non-2xx — it NEVER throws and NEVER blocks
// on the network.
//
// HARDENING item 1 (the key one for this module): ZERO REPO_ROOT computation. This module does
// NOT know where the repo is and does NOT resolve _SYSTEM/data/osv-snapshot.json itself. The
// ORCHESTRATOR injects the snapshot — either as a pre-parsed object (`snapshot`) or an absolute
// path (`snapshotPath`) — via dependency injection. That is why root-architecture.test.mjs
// cannot flag a wrong-repo-root pattern here: there is no path.resolve(SCRIPT_DIR, '..') and no
// hardcoded absolute root anywhere in this file.
// HARDENING item 4: --osv-online uses AbortController with a bounded timeout and fail-soft.

import fs from 'node:fs';

const DEFAULT_ONLINE_TIMEOUT_MS = 4000;
const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';

// --- semver-lite comparison (no dependency). Compares numeric major.minor.patch; ignores
// prerelease/build tags conservatively (treats them as the base version). ---
function parseVer(v) {
  const m = String(v ?? '').trim().replace(/^[v=~^><]+/, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
}

function cmpVer(a, b) {
  const x = parseVer(a);
  const y = parseVer(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

// Is `version` within [introduced, fixed)? introduced inclusive, fixed exclusive.
// A range with introduced==fixed==same value means "all versions affected" (no fix).
function versionInRange(version, range) {
  const introduced = range.introduced ?? '0.0.0';
  const fixed = range.fixed;
  const geIntro = cmpVer(version, introduced);
  if (geIntro === null) return false;
  if (geIntro < 0) return false; // version < introduced
  if (!fixed) return true; // no fix => everything >= introduced is affected
  if (introduced === fixed) return true; // sentinel: all versions compromised (malicious pkg)
  const ltFixed = cmpVer(version, fixed);
  if (ltFixed === null) return false;
  return ltFixed < 0; // version < fixed
}

// Extract {name, version} pairs from a parsed package.json's dependency maps.
export function extractDependencies(pkg) {
  const deps = [];
  if (!pkg || typeof pkg !== 'object') return deps;
  const maps = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  for (const key of maps) {
    const m = pkg[key];
    if (!m || typeof m !== 'object') continue;
    for (const [name, spec] of Object.entries(m)) {
      deps.push({ name, spec: String(spec), scope: key });
    }
  }
  return deps;
}

function loadSnapshot({ snapshot, snapshotPath }) {
  if (snapshot && typeof snapshot === 'object') return snapshot;
  if (snapshotPath) {
    try {
      return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    } catch {
      return { advisories: [] };
    }
  }
  return { advisories: [] };
}

// Match deps against the offline snapshot. Returns finding objects keyed VULNERABLE_DEPENDENCY.
function matchOffline(deps, snapshot) {
  const advisories = Array.isArray(snapshot?.advisories) ? snapshot.advisories : [];
  const findings = [];
  for (const dep of deps) {
    for (const adv of advisories) {
      if (adv.package !== dep.name) continue;
      const ranges = Array.isArray(adv.ranges) ? adv.ranges : [];
      const hit = ranges.some((r) => versionInRange(dep.spec, r));
      if (hit) {
        findings.push({
          id: 'VULNERABLE_DEPENDENCY',
          label: `${dep.name}@${dep.spec} :: ${adv.id}`,
          severity: adv.severity || 'HIGH',
          evidence: `${dep.name}@${dep.spec} matches ${adv.id} (${adv.aliases?.join(', ') || 'no-alias'}): ${adv.summary}`,
          source: 'offline-snapshot',
        });
      }
    }
  }
  return findings;
}

// --osv-online: query OSV.dev with a bounded AbortController timeout. Fail-soft: on ANY error
// return null so the caller falls back to the offline result. NEVER throws.
async function queryOnline(deps, timeoutMs) {
  if (typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const queries = deps.map((d) => ({ package: { ecosystem: 'npm', name: d.name }, version: parseVerString(d.spec) }))
      .filter((q) => q.version);
    if (!queries.length) return [];
    const res = await fetch(OSV_BATCH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ queries }),
    });
    if (!res || !res.ok) return null;
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const findings = [];
    results.forEach((r, idx) => {
      const vulns = Array.isArray(r?.vulns) ? r.vulns : [];
      const dep = deps[idx];
      for (const v of vulns) {
        findings.push({
          id: 'VULNERABLE_DEPENDENCY',
          label: `${dep?.name}@${dep?.spec} :: ${v.id}`,
          severity: 'HIGH',
          evidence: `${dep?.name}@${dep?.spec} matches ${v.id} (OSV.dev live)`,
          source: 'osv-online',
        });
      }
    });
    return findings;
  } catch {
    return null; // fail-soft
  } finally {
    clearTimeout(timer);
  }
}

function parseVerString(spec) {
  const p = parseVer(spec);
  return p ? p.join('.') : null;
}

/**
 * lookup({ pkg, snapshot, snapshotPath, online, timeoutMs }) -> { findings, mode, online, degraded }
 * - pkg: parsed package.json object (orchestrator parses it; we never read a hardcoded path)
 * - snapshot / snapshotPath: INJECTED offline data (object preferred; path acceptable)
 * - online: boolean (--osv-online); default false => OFFLINE
 * NEVER throws.
 */
export async function lookup({ pkg, snapshot, snapshotPath, online = false, timeoutMs = DEFAULT_ONLINE_TIMEOUT_MS } = {}) {
  let deps;
  try {
    deps = extractDependencies(pkg);
  } catch {
    return { findings: [], mode: 'offline', online: false, degraded: true };
  }
  if (!deps.length) {
    return { findings: [], mode: online ? 'online-empty' : 'offline', online, degraded: false };
  }

  const snap = loadSnapshot({ snapshot, snapshotPath });
  const offlineFindings = matchOffline(deps, snap);

  if (!online) {
    return { findings: offlineFindings, mode: 'offline', online: false, degraded: false };
  }

  const onlineFindings = await queryOnline(deps, timeoutMs);
  if (onlineFindings === null) {
    // fail-soft to offline
    return { findings: offlineFindings, mode: 'online-failed-soft-to-offline', online: true, degraded: true };
  }
  // merge online + offline, dedupe by label
  const merged = [...offlineFindings];
  const seen = new Set(offlineFindings.map((f) => f.label));
  for (const f of onlineFindings) {
    if (!seen.has(f.label)) { seen.add(f.label); merged.push(f); }
  }
  return { findings: merged, mode: 'online', online: true, degraded: false };
}

// CLI self-check: node osv-lookup.mjs <package.json> <snapshot.json> [--osv-online]
if (import.meta.url === `file://${process.argv[1]}`) {
  const pkgPath = process.argv[2];
  const snapPath = process.argv[3];
  const online = process.argv.includes('--osv-online');
  if (!pkgPath || !snapPath) {
    process.stderr.write('usage: node osv-lookup.mjs <package.json> <snapshot.json> [--osv-online]\n');
    process.exit(1);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const out = await lookup({ pkg, snapshotPath: snapPath, online });
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}
