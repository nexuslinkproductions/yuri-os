#!/usr/bin/env node
// @capability: pilot-feedback-capture
// @serves: pilot user feedback loop | good+negative feedback capture | usage-to-improvement compounding | René pilot signal
// @does: captures explicit + passive (git-branch) pilot feedback into a JSONL ledger; reports polarity+tag patterns.
//        Negative feedback = a ΔU/surprise signal (routes into NEURO_CORE weighting, A3). The ingest-git path
//        automates what a manual pilot review does — turning a pilot user's branch pushes into structured signal.
// @use:
//   node pilot-feedback.mjs add --pilot rene --polarity bad --source explicit --tag voice --note "robotic TTS rejected"
//   node pilot-feedback.mjs ingest-git --pilot rene --branch origin/rene --since 1d
//   node pilot-feedback.mjs report --pilot rene
// @exports: addFeedback, ingestGitFeedback, reportFeedback, classifyCommit, DEFAULT_LEDGER

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { appendJsonl, readJsonl } from '../lib/jsonl.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const DEFAULT_LEDGER = process.env.YURI_PILOT_FEEDBACK_LEDGER
  || path.join(REPO_ROOT, '_SYSTEM', 'state', 'pilot-feedback.jsonl');

// Commit-subject → polarity heuristics. A replacement/fix/rejection is NEGATIVE feedback on the
// prior state (the thing it replaced was wrong); an addition/build/enable is POSITIVE.
const NEG_RE = /\b(replac|reject|broken|wrong|fix|rollback|revert|hate|robotic|crash|hang|fail|unable|cannot|missing|removed|delete|dead)\b/i;
const POS_RE = /\b(add|new|improve|improves|ship|shipped|feature|enable|enabled|wire|wired|scaffold|launch|works|builds?)\b/i;

const TAG_RULES = [
  ['voice', /voice|tts|kokoro|sapi|\baudio|speak|wake.?word|barge/i],
  ['file-io', /read_file|pdf|word|excel|\.docx|\.xlsx|extract|ingest/i],
  ['safety', /\bgate\b|\bscope|guard|protect|\bcgs|folder|blast/i],
  ['memory', /fts5|search_files|index|reindex|second.?brain|\brag\b|memory/i],
  ['launcher', /launcher|\bcli\b|one.?word/i],
  ['persona', /persona|interview|operator.?aware/i],
  ['tool', /lightburn|daily.?tool|tool.?list/i],
  ['automation', /scheduler|launchd|auto.?reindex|cron|task.?scheduler/i],
];

export function classifyCommit(subject) {
  const s = String(subject || '');
  const neg = NEG_RE.test(s);
  const pos = POS_RE.test(s);
  let polarity = 'neutral';
  if (neg) polarity = 'bad';          // a fix/replacement reads as negative feedback on prior state
  else if (pos) polarity = 'good';
  let tag = 'other';
  for (const [t, re] of TAG_RULES) if (re.test(s)) { tag = t; break; }
  return { polarity, tag };
}

export function addFeedback({ pilot, polarity, source = 'explicit', tag = 'other', note = '', commit = null, author = null, ledger = DEFAULT_LEDGER }) {
  if (!pilot) throw new Error('pilot-feedback: --pilot required');
  if (!['good', 'bad', 'neutral'].includes(polarity)) throw new Error(`pilot-feedback: polarity must be good|bad|neutral, got "${polarity}"`);
  const record = { ts: new Date().toISOString(), pilot, polarity, source, tag, note, commit, author };
  const ok = appendJsonl(ledger, record);
  return { ok, record };
}

function defaultGitLog(branch, since) {
  try {
    return execFileSync('git', ['log', String(branch), `--since=${since}`, '--format=%h|%an|%s'], { cwd: REPO_ROOT, encoding: 'utf8' });
  } catch { return ''; }
}

export function ingestGitFeedback({ pilot, branch, since = '1d', author = null, ledger = DEFAULT_LEDGER, gitLog = defaultGitLog }) {
  if (!pilot || !branch) throw new Error('pilot-feedback ingest-git: --pilot and --branch required');
  const raw = gitLog(branch, since);
  const ingested = [];
  for (const line of String(raw).split('\n')) {
    if (!line.trim()) continue;
    const [hash, who, ...subj] = line.split('|');
    const subject = subj.join('|').trim();
    if (!hash || !subject) continue;
    if (author && who && who.toLowerCase() !== String(author).toLowerCase()) continue;
    const { polarity, tag } = classifyCommit(subject);
    if (polarity === 'neutral') continue; // only signal-bearing commits
    addFeedback({ pilot, polarity, source: 'commit', tag, note: subject, commit: hash, author: who || null, ledger });
    ingested.push({ hash, author: who || null, polarity, tag, subject });
  }
  return ingested;
}

export function reportFeedback({ pilot = null, ledger = DEFAULT_LEDGER } = {}) {
  const { records } = readJsonl(ledger);
  const filt = pilot ? records.filter((r) => r.pilot === pilot) : records;
  const byPolarity = { good: 0, bad: 0, neutral: 0 };
  const byTag = {};
  for (const r of filt) {
    byPolarity[r.polarity] = (byPolarity[r.polarity] || 0) + 1;
    byTag[r.tag] = byTag[r.tag] || { good: 0, bad: 0, neutral: 0 };
    byTag[r.tag][r.polarity] = (byTag[r.tag][r.polarity] || 0) + 1;
  }
  return { total: filt.length, byPolarity, byTag, recent: filt.slice(-5) };
}

// ── CLI ────────────────────────────────────────────────────────────────────
function flag(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

const cmd = process.argv[2];
if (cmd === 'add') {
  const { ok, record } = addFeedback({
    pilot: flag('--pilot'),
    polarity: flag('--polarity', 'neutral'),
    source: flag('--source', 'explicit'),
    tag: flag('--tag', 'other'),
    note: flag('--note', ''),
  });
  console.log(ok ? `recorded [${record.polarity}] ${record.tag} for ${record.pilot}` : 'FAILED to write');
} else if (cmd === 'ingest-git') {
  const ingested = ingestGitFeedback({ pilot: flag('--pilot'), branch: flag('--branch'), since: flag('--since', '1d'), author: flag('--author', null) });
  console.log(`ingested ${ingested.length} signal-bearing commits:`);
  for (const r of ingested) console.log(`  ${r.hash} [${r.polarity}] ${r.tag} — ${r.subject}`);
} else if (cmd === 'report') {
  const r = reportFeedback({ pilot: flag('--pilot', null) });
  console.log(JSON.stringify(r, null, 2));
} else {
  console.log(`pilot-feedback — capture good+negative pilot-user feedback into a compounding ledger

usage:
  node pilot-feedback.mjs add --pilot <name> --polarity good|bad|neutral [--source explicit|commit|session] [--tag <area>] [--note "..."]
  node pilot-feedback.mjs ingest-git --pilot <name> --branch <ref> [--since 1d] [--author <name>]
  node pilot-feedback.mjs report [--pilot <name>]

ledger: ${DEFAULT_LEDGER}`);
}
