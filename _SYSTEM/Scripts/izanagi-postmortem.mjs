#!/usr/bin/env node
/**
 * izanagi-postmortem.mjs — Outcome logger for Izanagi counterfactual decisions
 *
 * Called when a task closes after an Izanagi simulation was run.
 * Writes outcome back to the decision manifest, which feeds the
 * self-hypothesis.mjs validation cycle in the next neuron-loop.
 *
 * CLI:
 *   node _SYSTEM/Scripts/izanagi-postmortem.mjs --list                    # show all pending manifests
 *   node _SYSTEM/Scripts/izanagi-postmortem.mjs --close <id> <outcome>    # log outcome: confirmed|refuted|partial
 *   node _SYSTEM/Scripts/izanagi-postmortem.mjs --status                  # summary stats
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { readJsonOrNull as readJson } from './_lib/fs.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = path.resolve(__dirname, '../..');  // Scripts/ → _SYSTEM/ → repo root
const IZANAGI_DIR = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'izanagi');

const args = process.argv.slice(2);


function listManifests() {
  if (!existsSync(IZANAGI_DIR)) { console.log('No Izanagi manifests yet.'); return []; }
  return readdirSync(IZANAGI_DIR)
    .filter(f => f.startsWith('decision-') && f.endsWith('.json'))
    .map(f => ({ file: f, data: readJson(path.join(IZANAGI_DIR, f)) }))
    .filter(m => m.data);
}

if (args[0] === '--list') {
  const manifests = listManifests();
  if (!manifests.length) { console.log('No manifests.'); process.exit(0); }
  manifests.forEach(m => {
    const d = m.data;
    console.log(`${m.file}: branch=${d.chosen_branch} outcome=${d.outcome ?? 'pending'} ts=${d.ts?.slice(0,10)}`);
  });
  process.exit(0);
}

if (args[0] === '--status') {
  const manifests = listManifests();
  const closed = manifests.filter(m => m.data.outcome);
  const confirmed = closed.filter(m => m.data.outcome === 'confirmed').length;
  console.log(`Izanagi decisions: ${manifests.length} total, ${closed.length} closed`);
  if (closed.length) console.log(`  Accuracy: ${Math.round(confirmed/closed.length*100)}% confirmed`);
  process.exit(0);
}

if (args[0] === '--close' && args[1] && args[2]) {
  const id = args[1];
  const outcome = args[2]; // confirmed | refuted | partial
  const file = path.join(IZANAGI_DIR, `decision-${id}.json`);
  if (!existsSync(file)) {
    console.error(`No manifest found: decision-${id}.json`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.outcome = outcome;
  manifest.closed_at = new Date().toISOString();
  writeFileSync(file, JSON.stringify(manifest, null, 2));
  console.log(`Logged outcome=${outcome} for decision-${id}`);
  process.exit(0);
}

// ── Record a new Izanagi decision (called programmatically) ───────────────────

export function recordDecision({ turnId, task, chosenBranch, branches, reasoning }) {
  mkdirSync(IZANAGI_DIR, { recursive: true });
  const manifest = {
    turn_id:       turnId,
    ts:            new Date().toISOString(),
    task,
    chosen_branch: chosenBranch,
    branches:      branches || [],
    reasoning,
    outcome:       null,
    closed_at:     null,
  };
  const file = path.join(IZANAGI_DIR, `decision-${turnId}.json`);
  writeFileSync(file, JSON.stringify(manifest, null, 2));
  return file;
}

// ── Export pending decisions for self-hypothesis validation ───────────────────

export function getPendingDecisions() {
  return listManifests()
    .filter(m => !m.data.outcome)
    .map(m => m.data);
}

export function getClosedDecisions() {
  return listManifests()
    .filter(m => m.data.outcome)
    .map(m => m.data);
}

console.log('Usage: --list | --status | --close <id> <outcome>');
