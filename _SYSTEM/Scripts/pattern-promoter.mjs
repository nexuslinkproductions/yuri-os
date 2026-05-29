#!/usr/bin/env node
/**
 * pattern-promoter.mjs — Mine council synthesis logs for repeated patterns
 *
 * Reads nisaba/logs/council-synthesis.jsonl, clusters repeated findings by key,
 * promotes high-frequency patterns (≥3 occurrences in 72h) to global.md as
 * prevention rules.
 *
 * Output:
 *   nisaba/promoter/delta.json   — what was found and what was promoted
 *   nisaba/learning/global.md    — appended with new prevention rules
 *
 * CLI: node _SYSTEM/Scripts/pattern-promoter.mjs [--dry-run] [--threshold N]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const YURI_SENTINEL_DIR = path.join(REPO_ROOT, '.claude', 'yuri-sentinel');
const SYNTH_LOG  = path.join(YURI_SENTINEL_DIR, 'logs', 'council-synthesis.jsonl');
const GLOBAL_MD  = path.join(YURI_SENTINEL_DIR, 'learning', 'global.md');
const PROMOTER_DIR = path.join(YURI_SENTINEL_DIR, 'promoter');
const DELTA_PATH = path.join(PROMOTER_DIR, 'delta.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const THRESHOLD = parseInt(args.find(a => a.startsWith('--threshold='))?.split('=')[1] || '3', 10);
const WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours

// ── Load synthesis log ────────────────────────────────────────────────────────

function loadSynthesisRecords() {
  if (!existsSync(SYNTH_LOG)) return [];
  const cutoff = Date.now() - WINDOW_MS;
  return readFileSync(SYNTH_LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && new Date(r.ts).getTime() > cutoff);
}

// ── Cluster consensus findings ────────────────────────────────────────────────

function clusterFindings(records) {
  const clusters = {};
  for (const record of records) {
    for (const c of record.consensus || []) {
      const key = c.key || c.finding;
      if (!key) continue;
      if (!clusters[key]) {
        clusters[key] = {
          key,
          finding: c.finding,
          severity: c.severity,
          occurrences: 0,
          sessions: [],
          totalConfidence: 0,
        };
      }
      clusters[key].occurrences++;
      clusters[key].sessions.push(record.turnId);
      clusters[key].totalConfidence += c.confidence || 0.5;
    }
  }
  return Object.values(clusters)
    .filter(c => c.occurrences >= THRESHOLD)
    .sort((a, b) => b.occurrences - a.occurrences);
}

// ── Check if rule already in global.md ───────────────────────────────────────

function alreadyPromoted(finding) {
  if (!existsSync(GLOBAL_MD)) return false;
  const content = readFileSync(GLOBAL_MD, 'utf8');
  // Match on first 40 chars of finding to detect near-duplicates
  return content.includes(finding.slice(0, 40));
}

// ── Promote cluster to global.md ─────────────────────────────────────────────

function promoteToGlobalMd(cluster, ruleId) {
  const confidence = (cluster.totalConfidence / cluster.occurrences).toFixed(2);
  const rule = `- **${cluster.finding.slice(0, 120)}** ` +
    `(auto-promoted: seen ${cluster.occurrences}× in 72h, confidence=${confidence}, severity=${cluster.severity}, rule=${ruleId})`;

  const section = `\n### Auto-promoted ${new Date().toISOString().slice(0, 10)}\n${rule}\n`;
  if (!DRY_RUN) {
    appendFileSync(GLOBAL_MD, section);
  }
  return rule;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const records = loadSynthesisRecords();
const candidates = clusterFindings(records);

const promoted = [];
const skipped  = [];

for (const cluster of candidates) {
  const ruleId = `PR-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  if (alreadyPromoted(cluster.finding)) {
    skipped.push({ ...cluster, reason: 'already_in_global_md' });
    continue;
  }
  const rule = promoteToGlobalMd(cluster, ruleId);
  promoted.push({
    cluster_key: cluster.key,
    occurrences: cluster.occurrences,
    sessions: cluster.sessions.slice(0, 5),
    proposed_rule: rule,
    promoted: !DRY_RUN,
    rule_id_if_promoted: DRY_RUN ? null : ruleId,
  });
}

const delta = {
  ts: new Date().toISOString(),
  window_hours: 72,
  threshold: THRESHOLD,
  dry_run: DRY_RUN,
  records_scanned: records.length,
  candidates: candidates.length,
  promoted_count: promoted.length,
  skipped_count: skipped.length,
  promoted,
  skipped: skipped.map(s => ({ cluster_key: s.key, reason: s.reason })),
};

mkdirSync(PROMOTER_DIR, { recursive: true });
writeFileSync(DELTA_PATH, JSON.stringify(delta, null, 2));

console.log(`⬡ Pattern Promoter — ${delta.ts}`);
console.log(`  Scanned: ${records.length} records | Candidates: ${candidates.length} | Promoted: ${promoted.length} | Skipped: ${skipped.length}`);
if (promoted.length) {
  console.log('  Promoted rules:');
  promoted.forEach(p => console.log(`    [${p.rule_id_if_promoted || 'DRY'}] ${p.cluster_key} (×${p.occurrences})`));
}
if (DRY_RUN) console.log('  (dry-run — no writes to global.md)');
