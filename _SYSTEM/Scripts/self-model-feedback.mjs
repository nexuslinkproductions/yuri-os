#!/usr/bin/env node
/**
 * self-model-feedback.mjs — Scalar drive nudger for Musubi
 *
 * Reads the current fingerprint, recent pulse-vault logs, and the synthesis
 * history. Applies small drive updates from recent success signals.
 *
 * CLI:
 *   node _SYSTEM/Scripts/self-model-feedback.mjs           # update fingerprint
 *   node _SYSTEM/Scripts/self-model-feedback.mjs --dry-run  # compute only
 *   node _SYSTEM/Scripts/self-model-feedback.mjs --status   # show current fingerprint
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const NISABA_DIR = path.join(REPO_ROOT, '.claude', 'yuri-sentinel');
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');

const PATHS = {
  fingerprint: path.join(NISABA_DIR, 'self-model', 'fingerprint.json'),
  synthesisLog: path.join(NISABA_DIR, 'learning', 'synthesis.jsonl'),
  vaultLogDir: path.join(STATE_DIR, 'pulse-vault-log'),
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATUS = args.includes('--status');

function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readJsonLines(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function clampDrive(value) {
  return Math.max(0, Math.min(1, value));
}

function formatDrive(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function listRecentVaultLogs(dir, limit = 3) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)))
    .slice(0, limit);
}

function qualifiesVaultLog(text) {
  const hasZeroErrors = /\b0\s+errors?\b/i.test(text) || /\berrors?\s*[:=]\s*0\b/i.test(text);
  const hasFivePlusCompletions =
    /\b(?:[5-9]\d*)\s+completions?\b/i.test(text) ||
    /\bcompletions?\s*[:=]\s*(?:[5-9]\d*)\b/i.test(text);
  return hasZeroErrors && hasFivePlusCompletions;
}

function coerceDrive(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applySelfModelFeedback({ dryRun = false } = {}) {
  const fingerprint = readJson(PATHS.fingerprint) || {
    ts: new Date().toISOString(),
    drives: {
      curiosity: 0.5,
      improvement: 0.5,
      accuracy: 0.5,
    },
  };

  const currentDrives = {
    curiosity: coerceDrive(fingerprint.drives?.curiosity, 0),
    improvement: coerceDrive(fingerprint.drives?.improvement, 0),
    accuracy: coerceDrive(fingerprint.drives?.accuracy, 0),
  };

  const recentVaultLogs = listRecentVaultLogs(PATHS.vaultLogDir, 3);
  let curiosityBoosts = 0;
  for (const filePath of recentVaultLogs) {
    let text = '';
    try {
      text = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    if (qualifiesVaultLog(text)) {
      curiosityBoosts += 1;
    }
  }

  const hasStrongImprovementSignal = readJsonLines(PATHS.synthesisLog).some(
    (entry) => Number(entry?.improvement_score) > 65
  );

  const updatedDrives = {
    curiosity: clampDrive(currentDrives.curiosity + curiosityBoosts * 0.01),
    improvement: clampDrive(currentDrives.improvement + (hasStrongImprovementSignal ? 0.01 : 0)),
    accuracy: clampDrive(currentDrives.accuracy),
  };

  fingerprint.ts = new Date().toISOString();
  fingerprint.drives = updatedDrives;

  if (!dryRun) {
    mkdirSync(path.dirname(PATHS.fingerprint), { recursive: true });
    writeFileSync(PATHS.fingerprint, JSON.stringify(fingerprint, null, 2));
  }

  console.log(
    `[self-model-feedback] drives: curiosity=${formatDrive(updatedDrives.curiosity)} improvement=${formatDrive(updatedDrives.improvement)} accuracy=${formatDrive(updatedDrives.accuracy)}`
  );

  return { fingerprint, updatedDrives, curiosityBoosts, hasStrongImprovementSignal };
}

if (STATUS) {
  const fingerprint = readJson(PATHS.fingerprint);
  if (!fingerprint) {
    console.log('No fingerprint yet.');
    process.exit(0);
  }
  console.log(JSON.stringify(fingerprint, null, 2));
  process.exit(0);
}

applySelfModelFeedback({ dryRun: DRY_RUN });

export { applySelfModelFeedback };
