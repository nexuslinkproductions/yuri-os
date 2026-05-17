/**
 * brain-amplifier.mjs — M1 Braindump Supercharge
 *
 * Enriches the raw prompt with brain state BEFORE dispatch to advisors.
 * Advisors receive a grounded prompt (persona + memory + PDC priors + spatial),
 * not a raw 240-char slice. This turns 6 disconnected models into 6 perspectives
 * on the same grounded reality.
 *
 * Called by pulse-orchestrator before building the preflight prompt.
 * All reads are from existing cache files — zero new blocking I/O.
 *
 * Output cap: ~600 tokens. Terse. Structured. Not prose.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PATHS = {
  soul:         path.join(REPO_ROOT, 'SOUL.md'),
  ragCache:     path.join(REPO_ROOT, '.claude', 'state', 'rag-turn-context.json'),
  cortexState:  path.join(REPO_ROOT, '.claude', 'state', 'cortex-state.json'),
  palaceIndex:  path.join(REPO_ROOT, 'claude-palace-out', 'palace-index.md'),
  pdcSkill:     path.join(REPO_ROOT, '.claude', 'skills', 'probabilistic-decision-core', 'SKILL.md'),
  pdcCalibLog:  path.join(REPO_ROOT, '_SYSTEM', 'SELF-IMPROVEMENT', '02_EXTRACT', 'probability-calibration-log.md'),
  globalMd:     path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'learning', 'global.md'),
};

const RAG_TTL_MS = 10 * 60 * 1000; // 10 min — wider window for amplifier

// ── Loaders ──────────────────────────────────────────────────────────────────

function loadPersonaCore() {
  try {
    if (!existsSync(PATHS.soul)) return null;
    const content = readFileSync(PATHS.soul, 'utf8');
    // Extract first sentence of each of the 4 core behavioral rules
    const rules = [];
    const coreHeadings = [
      'Be an adversarial ally',
      'Treat rules as testable machinery',
      'Run divergent scan before convergence',
      'Use polymathic transfer with verification',
    ];
    for (const heading of coreHeadings) {
      const match = content.match(new RegExp(`\\*\\*${heading}[^*]*\\*\\*[^.]+\\.`));
      if (match) rules.push(match[0].replace(/\*\*/g, '').slice(0, 120));
    }
    return rules.length ? rules.join(' | ') : null;
  } catch { return null; }
}

function loadLtmFragments(prompt) {
  try {
    if (!existsSync(PATHS.ragCache)) return [];
    const raw = JSON.parse(readFileSync(PATHS.ragCache, 'utf8'));
    if (!raw?.items || !Array.isArray(raw.items)) return [];
    if (raw.ts && (Date.now() - raw.ts) > RAG_TTL_MS) return [];
    return raw.items
      .filter(m => m.status === 'active' && m.canonical_summary)
      .slice(0, 4)
      .map(m => m.canonical_summary.slice(0, 120));
  } catch { return []; }
}

function loadPdcPriors() {
  try {
    const lines = [];

    // PDC doctrine (first 3 operating principles)
    if (existsSync(PATHS.pdcSkill)) {
      const content = readFileSync(PATHS.pdcSkill, 'utf8');
      const doctrineMatch = content.match(/## Operating doctrine([\s\S]*?)(?=\n## |\n---)/);
      if (doctrineMatch) {
        const docLines = doctrineMatch[1].trim().split('\n')
          .filter(l => /^\d+\./.test(l.trim()))
          .slice(0, 3)
          .map(l => l.replace(/^\d+\.\s*/, '').trim());
        lines.push(...docLines);
      }
    }

    // Active priors from cortex-state (escalated risks = currently elevated beliefs)
    if (existsSync(PATHS.cortexState)) {
      const state = JSON.parse(readFileSync(PATHS.cortexState, 'utf8'));
      const escalated = Object.values(state.accumulatedRisk || {})
        .filter(r => r.escalated)
        .sort((a, b) => { const rank = { CRITICAL: 4, HIGH: 3, WARN: 2 }; return (rank[b.severity]||0) - (rank[a.severity]||0); })
        .slice(0, 2)
        .map(r => `Active prior [${r.severity}]: ${r.summary.slice(0, 80)}`);
      lines.push(...escalated);
    }

    // Most recent calibration entries
    if (existsSync(PATHS.pdcCalibLog)) {
      const content = readFileSync(PATHS.pdcCalibLog, 'utf8');
      const recentLine = content.trim().split('\n').filter(Boolean).slice(-2).join(' | ');
      if (recentLine.length > 10) lines.push(`Calibration: ${recentLine.slice(0, 140)}`);
    }

    return lines.slice(0, 5);
  } catch { return []; }
}

function loadPalaceAnchors() {
  try {
    if (!existsSync(PATHS.palaceIndex)) return [];
    const content = readFileSync(PATHS.palaceIndex, 'utf8');
    const hubMatch = content.match(/## Hub Concepts \(Most Central\)([\s\S]*?)(?=\n## [A-Z]|$)/);
    if (!hubMatch) return [];
    const conceptRE = /^\d+\.\s+\*\*([^*]+)\*\*/gm;
    const concepts = [];
    let m;
    while ((m = conceptRE.exec(hubMatch[1])) !== null && concepts.length < 4) {
      concepts.push(m[1].trim());
    }
    return concepts;
  } catch { return []; }
}

function loadLearnedRules() {
  try {
    if (!existsSync(PATHS.globalMd)) return [];
    const content = readFileSync(PATHS.globalMd, 'utf8');
    const autoSections = content.match(/### Auto-synthesized[\s\S]*?(?=\n### |\n# |$)/g) || [];
    return autoSections
      .flatMap(s => s.split('\n'))
      .filter(l => l.startsWith('- **'))
      .slice(0, 3)
      .map(l => l.replace(/^- \*\*/, '').replace(/\*\*.*/, '').trim());
  } catch { return []; }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * amplifyPrompt(rawPrompt) → enriched prompt string
 *
 * Prepends a compressed brain context block to the raw prompt.
 * Advisors see: brain context + original prompt.
 * Never modifies the original prompt text — only prepends.
 */
export function amplifyPrompt(rawPrompt) {
  const persona    = loadPersonaCore();
  const ltm        = loadLtmFragments(rawPrompt);
  const pdc        = loadPdcPriors();
  const palace     = loadPalaceAnchors();
  const rules      = loadLearnedRules();

  const sections = [];

  if (persona) {
    sections.push(`PERSONA: ${persona}`);
  }

  if (ltm.length) {
    sections.push(`LTM_MEMORY:\n${ltm.map(m => `  - ${m}`).join('\n')}`);
  }

  if (pdc.length) {
    sections.push(`PDC_PRIORS:\n${pdc.map(p => `  - ${p}`).join('\n')}`);
  }

  if (palace.length) {
    sections.push(`SPATIAL_ANCHORS: ${palace.join(' · ')}`);
  }

  if (rules.length) {
    sections.push(`LEARNED_RULES:\n${rules.map(r => `  - ${r}`).join('\n')}`);
  }

  if (!sections.length) return rawPrompt; // nothing loaded, return raw

  const block = `[YURI_BRAIN_CONTEXT]\n${sections.join('\n')}\n[/YURI_BRAIN_CONTEXT]\n\nPROMPT: ${rawPrompt}`;
  return block;
}

/**
 * amplifyPromptCompact(rawPrompt) → single-line compressed context prefix
 * Used when token budget is tight (e.g. Cassandra's 25s window).
 */
export function amplifyPromptCompact(rawPrompt) {
  const palace  = loadPalaceAnchors().slice(0, 2).join(',');
  const pdc     = loadPdcPriors().filter(l => l.startsWith('Active prior')).slice(0, 1).join('');
  const prefix  = [palace && `anchors=${palace}`, pdc].filter(Boolean).join(' ');
  return prefix ? `[ctx: ${prefix}] ${rawPrompt}` : rawPrompt;
}
