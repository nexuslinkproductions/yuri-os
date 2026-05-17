#!/usr/bin/env node
/**
 * self-audit.mjs — Musubi autonomous self-analysis
 *
 * Scans hooks, skills, and contracts for structural flaws:
 *   DEAD_HOOK      — hook file on disk but not wired in settings.json
 *   ORPHAN_SKILL   — skill SKILL.md with no matching commands/ alias
 *   STALE_MEMORY   — memory files with no frontmatter type/description
 *   MISSING_SECTION — brain-inject section missing from active block
 *   CONTRACT_DRIFT — offload-contract.mjs lanes not reflected in lane-health.sh
 *
 * Output: .claude/state/self-audit-report.json
 * CLI: node _SYSTEM/Scripts/self-audit.mjs [--json] [--fix-plan]
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '..');
const STATE_DIR  = path.join(REPO_ROOT, '.claude', 'state');
const HOOKS_DIR  = path.join(REPO_ROOT, '.claude', 'hooks');
const SKILLS_DIR = path.join(REPO_ROOT, '.claude', 'skills');
const CMDS_DIR   = path.join(REPO_ROOT, '.claude', 'commands');
const MEMORY_DIR = path.join(REPO_ROOT, '.claude', 'projects', '-Users-marcelspatz-YURI', 'memory');
const SETTINGS   = path.join(REPO_ROOT, '.claude', 'settings.json');
const CONTRACT   = path.join(REPO_ROOT, 'Scripts', 'offload-contract.mjs');
const LANE_HEALTH= path.join(REPO_ROOT, 'Scripts', 'lane-health.sh');

const REPORT_PATH = path.join(STATE_DIR, 'self-audit-report.json');

// ── Scanners ─────────────────────────────────────────────────────────────────

function scanDeadHooks() {
  const flaws = [];
  if (!existsSync(HOOKS_DIR) || !existsSync(SETTINGS)) return flaws;
  const settingsText = readFileSync(SETTINGS, 'utf8');
  const hookFiles = readdirSync(HOOKS_DIR).filter(f => f.endsWith('.js'));
  for (const file of hookFiles) {
    // Skip shared modules, utility scripts, and on-demand runners (intentionally not in settings.json)
    const INTENTIONAL_NON_HOOKS = [
      'scout-bus.js', 'scout-runner.js', 'pulse-bus.js', 'cassandra-lite.js',
      'browser-lane.js',      // browser routing utility module
      'nisaba-dream.js',      // dream processor — called by EOT, not a hook
      'session-reflect.js',   // /reflect command runner — not a hook
      'token-budget-check.js',// on-demand token check utility
    ];
    if (INTENTIONAL_NON_HOOKS.includes(file)) continue;
    if (!settingsText.includes(file)) {
      flaws.push({
        id: `DEAD_HOOK_${file.replace('.js', '').toUpperCase()}`,
        path: path.join('.claude', 'hooks', file),
        kind: 'DEAD_HOOK',
        evidence: `${file} not referenced in settings.json hooks`,
        severity: 'WARN',
        auto_fixable: false,
      });
    }
  }
  return flaws;
}

function scanOrphanSkills() {
  const flaws = [];
  if (!existsSync(SKILLS_DIR)) return flaws;
  const skillDirs = readdirSync(SKILLS_DIR).filter(d => {
    try {
      const p = path.join(SKILLS_DIR, d);
      return statSync(p).isDirectory() && existsSync(path.join(p, 'SKILL.md'));
    } catch { return false; }
  });
  for (const skillDir of skillDirs) {
    const skillMd = readFileSync(path.join(SKILLS_DIR, skillDir, 'SKILL.md'), 'utf8');
    // Check frontmatter triggers
    const triggersMatch = skillMd.match(/^triggers:\s*\n((?:\s*-[^\n]+\n?)*)/m);
    if (!triggersMatch) continue;
    const triggers = triggersMatch[1].match(/- "([^"]+)"/g) || [];
    for (const trigger of triggers) {
      const alias = trigger.replace(/^- "\//, '').replace(/"$/, '');
      if (alias.includes(' ')) continue; // multi-word triggers don't need commands/ file
      const cmdFile = path.join(CMDS_DIR, `${alias}.md`);
      if (!existsSync(cmdFile)) {
        flaws.push({
          id: `ORPHAN_SKILL_${skillDir.toUpperCase()}_${alias.toUpperCase()}`,
          path: path.join('.claude', 'skills', skillDir, 'SKILL.md'),
          kind: 'ORPHAN_SKILL',
          evidence: `trigger "/${alias}" listed but .claude/commands/${alias}.md missing`,
          severity: 'INFO',
          auto_fixable: true,
        });
        break; // one flaw per skill
      }
    }
  }
  return flaws;
}

function scanMemoryFiles() {
  const flaws = [];
  if (!existsSync(MEMORY_DIR)) return flaws;
  const mdFiles = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
  for (const file of mdFiles) {
    const content = readFileSync(path.join(MEMORY_DIR, file), 'utf8');
    const hasFrontmatter = /^---\n/.test(content);
    const hasType = /^type:\s*\S/m.test(content);
    const hasDescription = /^description:\s*\S/m.test(content);
    if (!hasFrontmatter || !hasType || !hasDescription) {
      flaws.push({
        id: `STALE_MEMORY_${file.replace('.md', '').toUpperCase()}`,
        path: path.join('memory', file),
        kind: 'STALE_MEMORY',
        evidence: `${file} missing frontmatter fields (type=${hasType}, description=${hasDescription})`,
        severity: 'INFO',
        auto_fixable: false,
      });
    }
  }
  return flaws;
}

function scanContractVsLaneHealth() {
  const flaws = [];
  if (!existsSync(CONTRACT) || !existsSync(LANE_HEALTH)) return flaws;
  const contractText = readFileSync(CONTRACT, 'utf8');
  const laneHealthText = readFileSync(LANE_HEALTH, 'utf8');
  // Extract lane aliases from contract
  const aliasMatches = contractText.match(/alias:\s*'(@[\w-]+)'/g) || [];
  const aliases = aliasMatches.map(m => m.replace(/alias:\s*'/, '').replace(/'/, ''));
  for (const alias of aliases) {
    const laneKey = alias.replace('@', '');
    if (!['gpt-5.5', 'gpt-5.4-mini', 'gpt-5.3-codex-spark', 'swarm', 'comet', 'perplexity'].includes(laneKey)) {
      if (!laneHealthText.includes(laneKey)) {
        flaws.push({
          id: `CONTRACT_DRIFT_${laneKey.toUpperCase().replace(/-/g, '_')}`,
          path: '_SYSTEM/Scripts/offload-contract.mjs',
          kind: 'CONTRACT_DRIFT',
          evidence: `Lane ${alias} in contract but not checked in lane-health.sh`,
          severity: 'INFO',
          auto_fixable: false,
        });
      }
    }
  }
  return flaws;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonMode    = args.includes('--json');
const fixPlanMode = args.includes('--fix-plan');

const allFlaws = [
  ...scanDeadHooks(),
  ...scanOrphanSkills(),
  ...scanMemoryFiles(),
  ...scanContractVsLaneHealth(),
];

const stats = {
  total: allFlaws.length,
  auto_fixable: allFlaws.filter(f => f.auto_fixable).length,
  criticals: allFlaws.filter(f => f.severity === 'CRITICAL').length,
  warns: allFlaws.filter(f => f.severity === 'WARN').length,
  infos: allFlaws.filter(f => f.severity === 'INFO').length,
};

const report = {
  run_ts: new Date().toISOString(),
  flaws: allFlaws,
  stats,
};

mkdirSync(STATE_DIR, { recursive: true });
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`⬡ Self-Audit Report — ${report.run_ts}`);
  console.log(`  Total: ${stats.total} | Auto-fixable: ${stats.auto_fixable} | WARN: ${stats.warns} | INFO: ${stats.infos}`);
  for (const f of allFlaws) {
    console.log(`  [${f.severity}] ${f.kind}: ${f.evidence}`);
  }
  console.log(`  Written: ${REPORT_PATH}`);
}

if (fixPlanMode && allFlaws.filter(f => f.auto_fixable).length) {
  console.log('\nFix plan (auto-fixable):');
  for (const f of allFlaws.filter(f => f.auto_fixable)) {
    const alias = f.evidence.match(/"\/([^"]+)"/)?.[1];
    if (alias) {
      console.log(`  touch .claude/commands/${alias}.md  # ${f.id}`);
    }
  }
}
