#!/usr/bin/env node
/**
 * yuri-energy-config — the bridge that makes the cockpit's dials REAL.
 *
 * Reads an optional `_SYSTEM/SELF/energy-weights.json` override and returns a
 * validated PARTIAL config { weights?, threshold?, salience?, enforce? }. The
 * live gate path (energy-tick) merges this over its defaults, so a tuned value
 * persisted to that file actually steers every real transition. Absent or
 * invalid file → {} (fail-safe: the gate falls back to the standard defaults).
 *
 * Validation mirrors normalizeWeights (known keys, finite, non-negative) so a
 * malformed config can never corrupt the gate — bad fields are dropped, not
 * applied. See _SYSTEM/docs/icm-mwp-energy-governance-and-firing-policy.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WEIGHTS } from './yuri-energy.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..', '..'); // _SYSTEM/Scripts/math → repo root
export const CONFIG_FILE = path.join(REPO_ROOT, '_SYSTEM', 'SELF', 'energy-weights.json');

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

/**
 * Read + validate the override file. Returns only the fields that are present
 * and valid; everything else is dropped (fail-closed on bad input).
 * @param {string} [file] override path (defaults to the canonical config file)
 */
export function loadEnergyConfig(file = CONFIG_FILE) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  if (!raw || typeof raw !== 'object') return {};
  const out = {};

  // weights — only known keys, finite, non-negative (mirror normalizeWeights).
  if (raw.weights && typeof raw.weights === 'object' && !Array.isArray(raw.weights)) {
    const w = {};
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      const n = num(raw.weights[k]);
      if (n !== null && n >= 0) w[k] = n;
    }
    if (Object.keys(w).length) out.weights = w;
  }

  const t = num(raw.threshold);
  if (t !== null) out.threshold = t;

  // salience — depthThreshold (int≥1), surpriseK (≥0), surpriseWindow (int≥1).
  if (raw.salience && typeof raw.salience === 'object' && !Array.isArray(raw.salience)) {
    const s = {};
    const dt = num(raw.salience.depthThreshold); if (dt !== null && dt >= 1) s.depthThreshold = Math.trunc(dt);
    const sk = num(raw.salience.surpriseK); if (sk !== null && sk >= 0) s.surpriseK = sk;
    const sw = num(raw.salience.surpriseWindow); if (sw !== null && sw >= 1) s.surpriseWindow = Math.trunc(sw);
    if (Object.keys(s).length) out.salience = s;
  }

  if (typeof raw.enforce === 'boolean') out.enforce = raw.enforce;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify({ configFile: CONFIG_FILE, loaded: loadEnergyConfig() }, null, 2));
}
