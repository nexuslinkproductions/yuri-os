#!/usr/bin/env node
/**
 * packaging-check.mjs — validate YURI Core export artifact before invite release.
 *
 * Usage:
 *   node _SYSTEM/Scripts/packaging-check.mjs --export-dir /tmp/yuri-core-export
 *   node _SYSTEM/Scripts/packaging-check.mjs --plan   # plan only, no export dir
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planExport } from './yuri-export.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const MANIFEST_PATH = join(REPO_ROOT, '_SYSTEM/config/export-manifest.json');

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(base, full);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full, base));
    else out.push(rel);
  }
  return out;
}

function scanText(dir, patterns) {
  const hits = [];
  for (const rel of walk(dir)) {
    if (!/\.(md|mjs|js|json|sh|yaml|yml|txt|html|ts|tsx)$/i.test(rel)) continue;
    const text = readFileSync(join(dir, rel), 'utf8');
    for (const pat of patterns) {
      if (text.includes(pat) || new RegExp(pat, 'i').test(text)) {
        hits.push({ file: rel, pattern: pat });
        break;
      }
    }
  }
  return hits;
}

export function runPackagingCheck(opts = {}) {
  const manifest = loadManifest();
  const exportDir = opts.exportDir;
  const checks = [];
  let ok = true;

  if (!exportDir) {
    const plan = planExport(manifest);
    checks.push({ id: 'plan', ok: plan.selected > 0, detail: `${plan.selected} files in export plan` });
    return { ok: plan.selected > 0, checks, plan: plan.selected };
  }

  if (!existsSync(exportDir)) {
    return { ok: false, checks: [{ id: 'exists', ok: false, detail: 'export dir missing' }] };
  }

  const pathHits = scanText(exportDir, manifest.scrub.pathPatterns);
  checks.push({
    id: 'no-marcelspatz-paths',
    ok: pathHits.length === 0,
    detail: pathHits.length ? `${pathHits.length} path leak(s)` : 'clean',
    hits: pathHits.slice(0, 10),
  });
  if (pathHits.length) ok = false;

  const ipHits = scanText(exportDir, manifest.scrub.ipPatterns);
  checks.push({
    id: 'no-rick-deadpool-ip',
    ok: ipHits.length === 0,
    detail: ipHits.length ? `${ipHits.length} IP hit(s)` : 'clean',
    hits: ipHits.slice(0, 10),
  });
  if (ipHits.length) ok = false;

  const memPath = join(exportDir, '.claude/memory');
  const memOk = !existsSync(memPath);
  checks.push({ id: 'no-claude-memory', ok: memOk, detail: memOk ? 'absent' : 'PRESENT — blocker' });
  if (!memOk) ok = false;

  const nexusFiles = walk(exportDir).filter((f) => f.startsWith('03_NEXUS-LINK' + join('', '')));
  const badNexus = nexusFiles.filter((f) =>
    /business|nexus-app|nexus-engine|bug-bounty/.test(f)
  );
  checks.push({
    id: 'identity-only-nexus-link',
    ok: badNexus.length === 0,
    detail: badNexus.length ? badNexus.join(', ') : 'Identity-only OK',
  });
  if (badNexus.length) ok = false;

  const personaOk = !existsSync(join(exportDir, '_SYSTEM/persona.md'));
  checks.push({ id: 'no-operator-persona', ok: personaOk, detail: personaOk ? 'absent' : 'PRESENT' });
  if (!personaOk) ok = false;

  return { ok, checks, fileCount: walk(exportDir).length };
}

// CLI
const args = process.argv.slice(2);
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const outIdx = args.indexOf('--export-dir');
  const exportDir = outIdx >= 0 ? args[outIdx + 1] : null;
  const result = exportDir
    ? runPackagingCheck({ exportDir })
    : runPackagingCheck({});
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
