#!/usr/bin/env node
// @capability: mure-blast-analyzer
// @serves: blast radius analysis | governance support | mure steward | impact assessment | safety margin | change scope
// @does: analyzes the blast radius of a proposed change — files touched, operations performed, external reach, production impact, and reversibility. Provides deterministic scoring + qualitative classification (LOW/MEDIUM/HIGH/CRITICAL). Used by Steward for governance gates and by Engineer for scoped-build decisions. DISARMED by default; arm via YURI_BLAST_ANALYZER_ENABLED=1 or touch _SYSTEM/state/mure.blast-analyzer.enabled.
// @use: import { analyzeBlast, classifyBlast, blastRank, BLAST } from mure/blast-analyzer.mjs; const result = analyzeBlast({files, operations, outwardFacing, production, reversible}).
// @exports: analyzeBlast, classifyBlast, blastRank, BLAST, isEnabled, ARM_FLAG, ARM_ENV
//
// Authority: ADVISORY. This tool INFORMS the governance gate; it does not OVERRIDE it. The Steward
// gate in governance.mjs is the final authority. Blast analysis is deterministic, not LLM-judged.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isArmed as libIsArmed } from '../lib/arming.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'mure.blast-analyzer.enabled');
export const ARM_ENV = 'YURI_BLAST_ANALYZER_ENABLED';

export const BLAST = Object.freeze({
  LOW: { tier: 0, label: 'LOW', color: 'green', maxScore: 0.33, description: 'reversible, isolated, no external reach' },
  MEDIUM: { tier: 1, label: 'MEDIUM', color: 'yellow', maxScore: 0.66, description: 'scoped changes, reversible, local impact' },
  HIGH: { tier: 2, label: 'HIGH', color: 'orange', maxScore: 0.90, description: 'broad scope, some external reach, irreversible' },
  CRITICAL: { tier: 3, label: 'CRITICAL', color: 'red', maxScore: 1.00, description: 'production / shared state / outward-facing / protected' },
});

// Protected surface prefixes (from yuri-origin.md)
const PROTECTED_PREFIXES = [
  '.env',
  'backend/data',
  '.claude/state',
  '.claude/history',
  '.claude/file-history',
  '.claude/projects/*/history',
  '.claude/projects/*/state',
  '.claude/projects/*/file-history',
  '.claude/projects/*/worktrees',
  '.claude/projects/*/transcripts',
];

// High-impact prefixes (not protected but still sensitive)
const HIGH_IMPACT_PREFIXES = [
  '_SYSTEM/yuri-origin.md',
  '_SYSTEM/mure/governance.mjs',
  '_SYSTEM/Scripts/llm-compat-contract.mjs',
];

/**
 * Check if blast analyzer is enabled. DISARMED by default.
 */
export function isEnabled() {
  return libIsArmed({ env: ARM_ENV, flag: ARM_FLAG });
}

/**
 * Classify a file path by impact tier.
 * Returns: { tier, reason, protected }.
 */
function classifyFile(filePath) {
  const normalized = path.normalize(filePath).replace(/\\/g, '/');

  // Protected paths → CRITICAL
  for (const prefix of PROTECTED_PREFIXES) {
    if (normalized.startsWith(prefix) || normalized.includes(prefix.replace('*', ''))) {
      return { tier: BLAST.CRITICAL.tier, reason: `protected-path:${prefix}`, protected: true };
    }
  }

  // High-impact files → HIGH
  for (const prefix of HIGH_IMPACT_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return { tier: BLAST.HIGH.tier, reason: `high-impact:${prefix}`, protected: false };
    }
  }

  // Runtime/cache → LOW (ephemeral)
  if (/node_modules|\.tmp|\.cache|\.venv|dist|build/i.test(normalized)) {
    return { tier: BLAST.LOW.tier, reason: 'runtime-cache', protected: false };
  }

  // Generated artifacts → LOW
  if (/generated|out$|\.out\.|graphify/i.test(normalized)) {
    return { tier: BLAST.LOW.tier, reason: 'generated-artifact', protected: false };
  }

  // Test files → LOW
  if (/\.test\.|test\.|spec\./i.test(path.basename(normalized))) {
    return { tier: BLAST.LOW.tier, reason: 'test-file', protected: false };
  }

  // _SYSTEM scripts → MEDIUM (control plane changes)
  if (normalized.startsWith('_SYSTEM/Scripts')) {
    return { tier: BLAST.MEDIUM.tier, reason: 'control-plane-script', protected: false };
  }

  // Skill files → MEDIUM
  if (normalized.startsWith('skills/')) {
    return { tier: BLAST.MEDIUM.tier, reason: 'skill-file', protected: false };
  }

  // Default → MEDIUM (source code, docs)
  return { tier: BLAST.MEDIUM.tier, reason: 'default-source', protected: false };
}

/**
 * Calculate a numeric blast score from 0-1 based on multiple factors.
 * Higher score = higher blast radius.
 */
function calculateScore(analysis) {
  let score = 0;

  // File tier contribution (0-0.5)
  const maxTier = BLAST.CRITICAL.tier;
  const avgFileTier = analysis.files.length > 0
    ? analysis.files.reduce((sum, f) => sum + f.tier, 0) / analysis.files.length
    : BLAST.MEDIUM.tier;
  score += (avgFileTier / maxTier) * 0.5;

  // File count contribution (logarithmic, non-saturating across 1→100 so more files always score higher
  // while 100× files is far less than 100× score). 0.03·log10(n): f(1)=0, f(10)=0.03, f(100)=0.06.
  const fileCount = Math.max(1, analysis.files.length);
  score += Math.min(0.15, Math.log10(fileCount) * 0.03);

  // Operations contribution (0-0.2)
  const operations = analysis.operations || [];
  if (operations.includes('delete')) score += 0.08;
  if (operations.includes('commit')) score += 0.05;
  if (operations.includes('push')) score += 0.07;
  if (operations.some(op => /publish|post|email|tweet/i.test(op))) score += 0.2;

  // Outward-facing contribution (0-0.2)
  if (analysis.outwardFacing) score += 0.2;

  // Production contribution (0-0.15)
  if (analysis.production) score += 0.15;

  // Reversibility discount (0-0.15)
  if (analysis.reversible) score -= 0.15;

  return Math.max(0, Math.min(1, score));
}

/**
 * Main blast analysis function.
 * @param {Object} input - { files, operations, outwardFacing, production, reversible }
 * @returns {Object} - { class, tier, label, score, details, protectedFiles, warnings }
 */
export function analyzeBlast(input = {}) {
  const files = Array.isArray(input.files) ? input.files : [];
  const operations = Array.isArray(input.operations) ? input.operations : [];

  // Classify each file
  const fileAnalyses = files.map(f => {
    const classification = classifyFile(f);
    return { path: f, ...classification };
  });

  // Extract protected files
  const protectedFiles = fileAnalyses.filter(f => f.protected);

  // Calculate base analysis
  const baseAnalysis = {
    files: fileAnalyses,
    operations,
    outwardFacing: Boolean(input.outwardFacing),
    production: Boolean(input.production),
    reversible: Boolean(input.reversible),
  };

  // Calculate score
  const score = calculateScore(baseAnalysis);

  // Hard floors — specific signals FORCE a minimum tier regardless of the blended score (a single
  // protected/high-impact/outward signal must not be averaged away). Reason-based, NOT raw file tier:
  // default-source stays score-driven (a reversible src edit is LOW), but control-plane/skill floor at
  // MEDIUM, high-impact at HIGH, protected at CRITICAL; outward/production floor at HIGH; empty → MEDIUM.
  let floor = BLAST.LOW.tier;
  const noSignal = files.length === 0 && operations.length === 0 && !baseAnalysis.outwardFacing && !baseAnalysis.production;
  if (noSignal) floor = Math.max(floor, BLAST.MEDIUM.tier);
  for (const f of fileAnalyses) {
    if (f.protected) floor = Math.max(floor, BLAST.CRITICAL.tier);
    else if (/^high-impact:/.test(f.reason)) floor = Math.max(floor, BLAST.HIGH.tier);
    else if (f.reason === 'control-plane-script' || f.reason === 'skill-file') floor = Math.max(floor, BLAST.MEDIUM.tier);
  }
  if (baseAnalysis.outwardFacing) floor = Math.max(floor, BLAST.HIGH.tier);
  if (baseAnalysis.production) floor = Math.max(floor, BLAST.HIGH.tier);

  // Final class = the higher of the score-derived tier and the hard floor.
  const scoreClass = classifyBlast(score);
  const blastClass = tierToBlast(Math.max(scoreClass.tier, floor));

  // Generate warnings
  const warnings = [];
  if (protectedFiles.length > 0) {
    warnings.push(`protected-paths: ${protectedFiles.map(f => f.path).join(', ')}`);
  }
  const highImpactFiles = fileAnalyses.filter(f => /^high-impact:/.test(f.reason));
  if (highImpactFiles.length > 0) {
    warnings.push(`high-impact: ${highImpactFiles.map(f => f.path).join(', ')}`);
  }
  if (baseAnalysis.outwardFacing) {
    warnings.push('outward-facing: email/post/publish detected');
  }
  if (baseAnalysis.production) {
    warnings.push('production-impact: changes affect production state');
  }
  if (!baseAnalysis.reversible) {
    warnings.push('irreversible: changes cannot be easily reverted');
  }
  if (score > BLAST.HIGH.maxScore) {
    warnings.push('critical-blast: score exceeds HIGH threshold');
  }

  return {
    class: blastClass,
    tier: blastClass.tier,
    label: blastClass.label,
    score: Number(score.toFixed(3)),
    color: blastClass.color,
    description: blastClass.description,
    details: {
      fileCount: files.length,
      operationCount: operations.length,
      avgFileTier: fileAnalyses.length > 0
        ? Number((fileAnalyses.reduce((sum, f) => sum + f.tier, 0) / fileAnalyses.length).toFixed(2))
        : 0,
      protectedCount: protectedFiles.length,
    },
    protectedFiles: protectedFiles.map(f => f.path),
    files: fileAnalyses,
    warnings,
    enabled: isEnabled(),
  };
}

/**
 * Classify a numeric score into a BLAST tier.
 */
export function classifyBlast(score) {
  const s = Number(score) || 0;
  if (s <= BLAST.LOW.maxScore) return BLAST.LOW;
  if (s <= BLAST.MEDIUM.maxScore) return BLAST.MEDIUM;
  if (s <= BLAST.HIGH.maxScore) return BLAST.HIGH;
  return BLAST.CRITICAL;
}

/** Map a numeric tier (0-3) back to its BLAST entry. */
function tierToBlast(tier) {
  return Object.values(BLAST).find(b => b.tier === tier) || BLAST.MEDIUM;
}

/**
 * Convert a tier label or number to a numeric rank.
 * Matches governance.mjs blastRank behavior.
 */
export function blastRank(b) {
  if (typeof b === 'number') {
    return (Number.isInteger(b) && b >= 0 && b <= BLAST.CRITICAL.tier) ? b : BLAST.HIGH.tier;
  }
  const k = String(b || 'HIGH').toUpperCase();
  return BLAST[k]?.tier ?? BLAST.HIGH.tier;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`
MURE Blast Analyzer — governance support for blast radius assessment

Usage:
  node blast-analyzer.mjs --analyze '<json>'
  node blast-analyzer.mjs --files file1.js,file2.md --operations edit,delete
  node blast-analyzer.mjs --status
  node blast-analyzer.mjs --arm
  node blast-analyzer.mjs --disarm

Input JSON format:
  {
    "files": ["path/to/file.js", ".env"],
    "operations": ["edit", "delete", "commit"],
    "outwardFacing": false,
    "production": false,
    "reversible": true
  }

Classification tiers:
  LOW (0-0.33):     reversible, isolated, no external reach
  MEDIUM (0.34-0.66): scoped changes, reversible, local impact
  HIGH (0.67-0.90):   broad scope, some external reach, irreversible
  CRITICAL (0.91+):   production / shared state / outward-facing / protected

Authority: ADVISORY only. The governance gate in governance.mjs is final.
`);
    process.exit(0);
  }

  if (argv.includes('--status')) {
    process.stdout.write(`Blast Analyzer: ${isEnabled() ? 'ARMED' : 'DISARMED'}\n`);
    if (isEnabled()) {
      const source = process.env[ARM_ENV] === '1' ? 'env' : 'flag';
      process.stdout.write(`  Source: ${source}\n`);
    }
    process.exit(0);
  }

  if (argv.includes('--arm')) {
    if (isEnabled()) {
      process.stdout.write('Already armed\n');
    } else {
      fs.writeFileSync(ARM_FLAG, Date.now().toString());
      process.stdout.write(`Armed via flag: ${ARM_FLAG}\n`);
    }
    process.exit(0);
  }

  if (argv.includes('--disarm')) {
    if (fs.existsSync(ARM_FLAG)) {
      fs.unlinkSync(ARM_FLAG);
      process.stdout.write('Disarmed\n');
    } else {
      process.stdout.write('Already disarmed\n');
    }
    process.exit(0);
  }

  // Parse input
  let input = {};
  const analyzeIdx = argv.indexOf('--analyze');
  if (analyzeIdx >= 0) {
    try {
      input = JSON.parse(argv[analyzeIdx + 1] || '{}');
    } catch (e) {
      process.stderr.write(`Error parsing JSON: ${e.message}\n`);
      process.exit(1);
    }
  } else {
    const filesIdx = argv.indexOf('--files');
    const opsIdx = argv.indexOf('--operations');
    if (filesIdx >= 0) {
      input.files = argv[filesIdx + 1]?.split(',').map(s => s.trim()) || [];
    }
    if (opsIdx >= 0) {
      input.operations = argv[opsIdx + 1]?.split(',').map(s => s.trim()) || [];
    }
    // Default flags
    input.reversible = true;
    input.outwardFacing = false;
    input.production = false;
  }

  // Analyze
  const result = analyzeBlast(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}