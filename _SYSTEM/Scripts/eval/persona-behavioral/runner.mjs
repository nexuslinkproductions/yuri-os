#!/usr/bin/env node
// persona-behavioral runner — runs cases against a subject and scores with the frozen rubric.
//
// Modes:
//   --validate              schema + GT integrity check for every case (exit 1 on any error)
//   --selftest              construct-validity smoke: synthesized GT-conform responses must PASS,
//                           synthesized GT-violating responses must FAIL (exit 1 otherwise)
//   --run --subject <cmd>   pipe each case prompt to <cmd> on stdin, score stdout,
//                           append results to the append-only results log
//   --run --subject <cmd> --only ratified
//
// Results log: _SYSTEM/state/eval/persona-behavioral/results.jsonl (runtime state, append-only).
// One line per case: { ts, runId, subject, rubricVersion, caseId, dimension, pass,
//                      checksPassed, checksTotal, responseSha256, excerpt }
// Full responses are never logged (bounded excerpt only).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RUBRIC_VERSION, scoreCase, validateCase } from './rubric.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const casesPath = join(here, 'cases.jsonl');
const logDir = join(repoRoot, '_SYSTEM', 'state', 'eval', 'persona-behavioral');
const logPath = join(logDir, 'results.jsonl');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

function loadCases() {
  return readFileSync(casesPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

// Build a GT-conform response: includes every must_include item and one
// must_include_any item, stays within word bands, avoids must_not items.
function synthGood(kase) {
  const parts = [];
  for (const c of kase.gt.checks) {
    if (c.type === 'must_include') parts.push(...c.items);
    if (c.type === 'must_include_any') parts.push(c.items[0]);
  }
  let text = parts.join(' ') || 'Antwort.';
  const minWords = kase.gt.checks.find((c) => c.type === 'min_words');
  if (minWords) {
    const filler = 'Diese Aussage ist geprüft und belegt. ';
    while (text.split(/\s+/).filter(Boolean).length < minWords.value + 3) text += filler;
  }
  return text;
}

// Build a GT-violating response: includes the first must_not item (or drops all
// required content and violates word bands).
function synthBad(kase) {
  const forbidden = kase.gt.checks.find((c) => c.type === 'must_not');
  const forbiddenRe = kase.gt.checks.find((c) => c.type === 'regex_must_not');
  if (forbidden) return `${forbidden.items[0]} — und sonst nichts.`;
  if (forbiddenRe) return `Antwort ${forbiddenRe.items[0]} mit Verstoß.`;
  const maxWords = kase.gt.checks.find((c) => c.type === 'max_words');
  if (maxWords) return new Array(maxWords.value + 40).fill('füllwort').join(' ');
  return 'Beliebige Antwort ohne jeden geforderten Inhalt.';
}

function cmdValidate() {
  const cases = loadCases();
  const ids = new Set();
  let errors = 0;
  for (const kase of cases) {
    if (ids.has(kase.id)) {
      console.error(`DUPLICATE id: ${kase.id}`);
      errors++;
    }
    ids.add(kase.id);
    for (const e of validateCase(kase)) {
      console.error(`${kase.id}: ${e}`);
      errors++;
    }
  }
  const proposed = cases.filter((c) => c.gt.status === 'proposed').length;
  const ratified = cases.filter((c) => c.gt.status === 'ratified').length;
  console.log(`cases=${cases.length} proposed=${proposed} ratified=${ratified} errors=${errors}`);
  if (errors) process.exit(1);
  console.log('PERSONA_EVAL_VALIDATE_PASS');
}

function cmdSelftest() {
  const cases = loadCases();
  let bad = 0;
  for (const kase of cases) {
    const good = scoreCase(kase, synthGood(kase));
    const evil = scoreCase(kase, synthBad(kase));
    if (!good.pass) {
      console.error(`SELFTEST GOOD-SHOULD-PASS failed: ${kase.id} -> ${JSON.stringify(good.results)}`);
      bad++;
    }
    if (evil.pass) {
      console.error(`SELFTEST BAD-SHOULD-FAIL passed: ${kase.id} -> ${JSON.stringify(evil.results)}`);
      bad++;
    }
  }
  console.log(`selftest cases=${cases.length} discriminating=${cases.length - bad} failures=${bad}`);
  if (bad) process.exit(1);
  console.log('PERSONA_EVAL_SELFTEST_PASS');
}

function cmdRun() {
  const subject = opt('--subject');
  if (!subject) {
    console.error('--run needs --subject <cmd> (prompt on stdin, response on stdout)');
    process.exit(2);
  }
  const only = opt('--only') || null;
  const runId = opt('--run-id') || `run-${Date.now()}`;
  const cases = loadCases().filter((c) => !only || c.gt.status === only);
  mkdirSync(logDir, { recursive: true });
  let pass = 0;
  for (const kase of cases) {
    let response = '';
    try {
      response = execFileSync(subject, [], {
        input: kase.prompt,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        timeout: 120000,
      });
    } catch (err) {
      response = `SUBJECT_ERROR: ${String(err).slice(0, 300)}`;
    }
    const score = scoreCase(kase, response);
    if (score.pass) pass++;
    const row = {
      ts: new Date().toISOString(),
      runId,
      subject,
      rubricVersion: RUBRIC_VERSION,
      caseId: kase.id,
      dimension: kase.dimension,
      gtStatus: kase.gt.status,
      pass: score.pass,
      checksPassed: score.checksPassed,
      checksTotal: score.checksTotal,
      failedChecks: score.results.filter((r) => !r.pass).map((r) => `${r.type}:${r.detail}`).slice(0, 4),
      responseSha256: sha(response),
      excerpt: response.replace(/\s+/g, ' ').slice(0, 180),
    };
    appendFileSync(logPath, JSON.stringify(row) + '\n');
  }
  console.log(`run=${runId} subject=${subject} cases=${cases.length} pass=${pass} fail=${cases.length - pass} rubric=${RUBRIC_VERSION}`);
  console.log(`log: ${logPath}`);
}

if (has('--selftest')) cmdSelftest();
else if (has('--validate')) cmdValidate();
else if (has('--run')) cmdRun();
else {
  console.log('usage: runner.mjs --validate | --selftest | --run --subject <cmd> [--only proposed|ratified] [--run-id <id>]');
  process.exit(2);
}
