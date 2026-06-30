#!/usr/bin/env node
// @capability: worker-narration-extractor
// @serves: narrate worker progress | summarize worker output | overseer narration | what is the worker doing | watch worker transcript
// @does: extracts NEW assistant turns from a worker session's transcript since a saved checkpoint, tags each with importance hints (commit/result-label/error/done/question/big), so the overseer can speak only meaningful summaries — not every turn.
// @use: overseer narration loop. `node _SYSTEM/Scripts/worker-narrate.mjs --peek` to see new turns without advancing; drop --peek to consume them. The overseer reads the JSON, judges importance, speaks a short summary via voice-speak.sh.
// @exports: extractNewTurns, classifyTurn
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const STATE_VOICE = path.join(REPO, '_SYSTEM', 'state', 'voice');
const LANE = path.join(REPO, '_SYSTEM', 'state', 'lane-sessions');
const PROJECTS = path.join(os.homedir(), '.claude', 'projects');

function slug(repo) { return repo.replace(/[/.]/g, '-'); }
function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

// Importance hints — what makes a worker turn worth speaking aloud.
export function classifyTurn(text) {
  const hints = [];
  if (/\b\d{2}[A-Z]{2}_[A-Z0-9_]+_(X|P|F)_(PASS|FAIL|COMMITTED)/.test(text)) hints.push('result-label');
  if (/\b(commit|committed|pushed|merg)/i.test(text)) hints.push('commit');
  if (/\b(error|failed|failing|broke|crash|exception|blocked|stale)\b/i.test(text)) hints.push('error');
  if (/\b(done|complete|completed|shipped|verified|green|✓|all tests pass)/i.test(text)) hints.push('done');
  if (/\?\s*$/.test(text.trim()) || /\b(your call|holding|hold for|waiting on|need your|confirm|approve)\b/i.test(text)) hints.push('question');
  if (text.length > 800) hints.push('big');
  return hints;
}

export function extractNewTurns(jsonl, fromLine, windowIfFresh = 6) {
  const lines = jsonl.split('\n').filter(Boolean);
  const total = lines.length;
  const start = (fromLine != null && fromLine >= 0 && fromLine <= total) ? fromLine : 0;
  const turns = [];
  for (let i = start; i < total; i++) {
    let o; try { o = JSON.parse(lines[i]); } catch { continue; }
    const m = o.message || o;
    if ((m.role || o.role) !== 'assistant') continue;
    const c = m.content;
    let t = '';
    if (typeof c === 'string') t = c;
    else if (Array.isArray(c)) t = c.filter((x) => x && x.type === 'text' && x.text).map((x) => x.text).join(' ');
    t = t.trim();
    if (!t) continue;
    turns.push({ line: i, chars: t.length, hints: classifyTurn(t), text: t });
  }
  // First run (no checkpoint): only surface the last `windowIfFresh` turns, not the whole history.
  const fresh = fromLine == null;
  const out = fresh ? turns.slice(-windowIfFresh) : turns;
  return { total, fresh, turns: out };
}

function main() {
  const argv = process.argv.slice(2);
  const peek = argv.includes('--peek');
  const reset = argv.includes('--reset');
  let worker = '';
  const wi = argv.indexOf('--worker'); if (wi >= 0) worker = argv[wi + 1] || '';
  let window = 6;
  const ni = argv.indexOf('--window'); if (ni >= 0) window = parseInt(argv[ni + 1], 10) || 6;

  if (!worker) worker = readFileSafe(path.join(LANE, 'worker.id')).trim();
  if (!worker) { console.log(JSON.stringify({ ok: false, error: 'no worker id (pass --worker or write lane-sessions/worker.id)' })); process.exit(3); }

  const tpath = path.join(PROJECTS, slug(REPO), `${worker}.jsonl`);
  const jsonl = readFileSafe(tpath);
  if (!jsonl) { console.log(JSON.stringify({ ok: false, error: `no transcript at ${tpath}` })); process.exit(3); }

  const cpFile = path.join(STATE_VOICE, `narrate-${worker}.json`);
  let fromLine = null;
  if (!reset) {
    try { fromLine = JSON.parse(readFileSafe(cpFile) || '{}').lastLine; } catch {}
    if (typeof fromLine !== 'number') fromLine = null;
  }

  const { total, fresh, turns } = extractNewTurns(jsonl, fromLine, window);

  if (!peek) {
    try { fs.mkdirSync(STATE_VOICE, { recursive: true }); fs.writeFileSync(cpFile, JSON.stringify({ lastLine: total, ts: new Date().toISOString() })); } catch {}
  }

  // cap each turn's text for the overseer to read (it summarizes; it doesn't need the full wall)
  const slim = turns.map((t) => ({ line: t.line, chars: t.chars, hints: t.hints, text: t.text.slice(0, 1200).replace(/\s+/g, ' ') }));
  console.log(JSON.stringify({ ok: true, worker, total, fresh, newTurns: slim.length, turns: slim }, null, 2));
}

const invokedDirectly = (() => {
  try { return process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (invokedDirectly) main();
