#!/usr/bin/env node
/**
 * palace-auto-rebuild.mjs — Autonomous palace-index rebuild
 *
 * Runs nightly via LaunchAgent. Logic:
 *   1. Detect active vault (T7 preferred, local NUDIMMUD fallback)
 *   2. Check if rebuild is needed: palace-index.md mtime vs most recent vault .md mtime
 *   3. If stale (vault changed since last rebuild), run palace-rebuild.py
 *   4. Copy outputs to local claude-palace-out/ if T7 was used
 *   5. Log result to .claude/state/palace-rebuild.log
 *
 * CLI:
 *   node _SYSTEM/Scripts/palace-auto-rebuild.mjs           # auto (stale-check + rebuild if needed)
 *   node _SYSTEM/Scripts/palace-auto-rebuild.mjs --force   # force rebuild regardless of staleness
 *   node _SYSTEM/Scripts/palace-auto-rebuild.mjs --check   # dry-run: print status and exit
 */

import { existsSync, statSync, mkdirSync, appendFileSync, cpSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '..');
const STATE_DIR  = path.join(REPO_ROOT, '.claude', 'state');
const LOG_FILE   = path.join(STATE_DIR, 'palace-rebuild.log');
const REBUILD_PY = path.join(REPO_ROOT, '_SYSTEM', 'palace-rebuild.py');

// Vault candidates: T7 preferred, local fallback
const VAULT_CANDIDATES = [
  { vault: '/Users/marcelspatz/YURI-OS-MUSUBI', output: '/Volumes/T7/claude-palace-out' },
  { vault: REPO_ROOT,              output: path.join(REPO_ROOT, 'claude-palace-out') },
];

const LOCAL_OUTPUT = path.join(REPO_ROOT, 'claude-palace-out');

function log(msg) {
  const line = `${new Date().toISOString()} [palace-auto-rebuild] ${msg}`;
  console.log(line);
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {}
}

function detectVault() {
  for (const candidate of VAULT_CANDIDATES) {
    if (existsSync(candidate.vault)) {
      return candidate;
    }
  }
  return null;
}

function mostRecentVaultMd(vaultPath) {
  // Use find to get most recently modified .md file in vault (excluding hidden dirs)
  try {
    const result = execSync(
      `find "${vaultPath}" -name "*.md" -not -path "*/.git/*" -not -path "*/.obsidian/*" -not -path "*/node_modules/*" -not -path "*/claude-palace-out/*" -newer "${path.join(vaultPath, 'claude-palace-out', 'palace-index.md')}" 2>/dev/null | head -1`,
      { encoding: 'utf8', timeout: 15000 }
    ).trim();
    return result.length > 0; // true = vault has changed since last rebuild
  } catch { return true; } // on error, assume stale
}

function palaceIndexAge(outputDir) {
  const indexPath = path.join(outputDir, 'palace-index.md');
  if (!existsSync(indexPath)) return Infinity;
  const ageMins = (Date.now() - statSync(indexPath).mtimeMs) / 60000;
  return ageMins;
}

function runRebuild(vault, output) {
  return new Promise((resolve) => {
    log(`rebuilding: vault=${vault} output=${output}`);
    const child = spawn('python3', [REBUILD_PY, '--vault', vault, '--output', output], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10 * 60 * 1000, // 10 min ceiling
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('close', code => {
      if (code === 0) {
        const lines = stdout.trim().split('\n').slice(-3).join(' | ');
        log(`rebuild OK (exit=0): ${lines}`);
        resolve({ ok: true, output });
      } else {
        log(`rebuild FAILED (exit=${code}): ${stderr.slice(0, 300)}`);
        resolve({ ok: false });
      }
    });
    child.on('error', e => {
      log(`rebuild spawn error: ${e.message}`);
      resolve({ ok: false });
    });
  });
}

function syncToLocal(outputDir) {
  if (outputDir === LOCAL_OUTPUT) return; // already local
  try {
    mkdirSync(LOCAL_OUTPUT, { recursive: true });
    cpSync(outputDir, LOCAL_OUTPUT, { recursive: true, force: true });
    log(`synced ${outputDir} → ${LOCAL_OUTPUT}`);
  } catch (e) {
    log(`sync to local failed: ${e.message}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const forceRebuild = args.includes('--force');
const checkOnly    = args.includes('--check');

const vault = detectVault();
if (!vault) {
  log('ERROR: no vault found (T7 not mounted, local vault missing)');
  process.exit(1);
}

if (!existsSync(REBUILD_PY)) {
  log(`ERROR: palace-rebuild.py not found at ${REBUILD_PY}`);
  process.exit(1);
}

const ageMins = palaceIndexAge(vault.output);
const isStale = ageMins > 60 * 12 || mostRecentVaultMd(vault.vault); // stale if >12h OR vault changed

log(`vault=${vault.vault} | index_age=${ageMins.toFixed(0)}min | stale=${isStale} | force=${forceRebuild}`);

if (checkOnly) {
  console.log(JSON.stringify({
    vault: vault.vault,
    output: vault.output,
    ageMins: Math.round(ageMins),
    isStale,
    wouldRebuild: forceRebuild || isStale,
  }));
  process.exit(0);
}

if (!forceRebuild && !isStale) {
  log('palace-index is current — no rebuild needed');
  process.exit(0);
}

const result = await runRebuild(vault.vault, vault.output);
if (result.ok) {
  syncToLocal(vault.output);
  log('palace-auto-rebuild complete');
  process.exit(0);
} else {
  log('palace-auto-rebuild failed');
  process.exit(1);
}
