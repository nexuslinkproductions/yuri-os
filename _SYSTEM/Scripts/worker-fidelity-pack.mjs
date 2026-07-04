#!/usr/bin/env node
// @capability: worker-fidelity-pack
// @serves: canonical context pack | dispatcher preamble | worker fidelity | unified context builder | peer operator loadout | small-model fidelity | glm fleet context | llm-lane context | mure company prompt | nano swarm preamble
// @does: ONE deterministic builder every dispatcher calls to hand a worker model the canonical YURI operating context — identity (peer operator, never Claude-impersonation), navigation commands, evidence grammar, protected paths, capability-first mandate, mutation rules, RESULT_LABEL return contract, and the caller's task + optional xref evidence. Compact (≤120 lines), no timestamps/randomness, substrate-aware identity. Eliminates per-dispatcher hand-rolled preambles (glm-fleet FLEET_PROTOCOL_PREAMBLE, llm-lane buildContextPack/nanoSwarmIdentityAnchor, company.mjs buildRolePrompt) by being the single source they can all call.
// @use: import { buildFidelityPack, SECTION_HEADERS, MAX_LINES } from 'worker-fidelity-pack.mjs'; const pack = buildFidelityPack('Build X with tests', { substrate:'glm', role:'engineer', files:['a.mjs','b.mjs'], xrefEvidence:['MATCH file=a.mjs term=foo line=12'], laneId:'08CW' }); CLI: node worker-fidelity-pack.mjs --task "..." [--substrate glm] [--role R] [--selftest]
// @exports: buildFidelityPack, buildSection, SECTION_HEADERS, MAX_LINES, SUBSTRATES, selftest
//
// WHY this exists: YURI dispatches worker models across 3 substrates (native Claude Agents, z.ai GLM
// lanes, ollama-cloud lanes) and the owner's goal is that ANY model — including small ones — operates
// at highest fidelity. Today each dispatcher hand-rolls its context (glm-fleet.mjs exports
// FLEET_PROTOCOL_PREAMBLE; llm-lane.mjs has buildContextPack + nanoSwarmIdentityAnchor; company.mjs
// buildRolePrompt casts prompts). The grammar (TERM_COUNT/FILE_COUNT/MATCH, RESULT_LABEL, protected
// paths) is repeated in prose across three files with subtle drift. This is the ONE canonical builder:
// every dispatcher imports buildFidelityPack and prepends its output to the task. Determinism is
// load-bearing — the pack is checksummed/compared across runs, so no timestamps, no Math.random,
// no Date. Sections are fixed-order; the task block is the only caller-variable tail.
//
// AUTHORITY: this file is a BEHAVIOR/PRESENTATION layer, not an authority layer. The pack states the
// YURI contract; it does not override yuri-origin.md, protected surfaces, owner intent, or local
// evidence verification. The dispatchers' HARD enforcement (lane-command-gate.mjs protectedPathHit,
// gitMutationHit; cost-reservation-pool; governance.mjs 6-gate) is the real guard — this pack TELLS
// the worker what those guards enforce, so the worker behaves well without hitting them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// ── constants (canonical: contract-conformance.mjs RESULT_LABEL grammar + PROTECTED_FLOOR) ──
export const MAX_LINES = 120;
export const SUBSTRATES = Object.freeze(['native', 'glm', 'ollama', 'mimo', 'cline']);
export const SECTION_HEADERS = Object.freeze([
  'IDENTITY', 'NAVIGATION', 'EVIDENCE GRAMMAR', 'PROTECTED PATHS',
  'CAPABILITY-FIRST', 'MUTATION RULES', 'RETURN CONTRACT', 'TASK',
]);
// Live enforcement list (contract-conformance.mjs PROTECTED_FLOOR + yuri-origin Protected Surfaces).
const PROTECTED_LIST = Object.freeze([
  '.env', 'backend/data', '.claude/state', '.claude/history', '.claude/file-history',
  '.claude/projects', 'node_modules', 'secrets', '.amp',
]);
// Substrate → how the worker sees its own model identity (recency-anchored anti-Claude-impersonation).
const SUBSTRATE_MODEL = Object.freeze({
  glm: 'a z.ai GLM lane',
  ollama: 'an Ollama-cloud peer lane',
  mimo: 'a Mimo peer lane',
  native: 'a native Anthropic Agent lane',
  cline: 'a Cline-pass peer lane',
});

/**
 * Build one section block. Internal — public callers use buildFidelityPack.
 * @param {string} header  SECTION_HEADERS member
 * @param {string} body     pre-joined multi-line body (no trailing newline)
 * @returns {string}        "===== HEADER =====\n<body>"
 */
export function buildSection(header, body) {
  return `===== ${header} =====\n${body}`;
}

/**
 * Build the canonical worker-fidelity context pack.
 *
 * @param {string} task   the caller's task text (REQUIRED)
 * @param {object} [opts]
 * @param {string} [opts.substrate='glm']  one of SUBSTRATES — selects the identity wording
 * @param {string} [opts.role]             MURE role id (e.g. 'engineer') — included in IDENTITY if given
 * @param {string[]} [opts.files]          files the worker should read first (NAVIGATION tail)
 * @param {string} [opts.laneId]           expected RESULT_LABEL LANE_ID (e.g. '08CW'); default 'NNXX'
 * @param {string[]} [opts.xrefEvidence]   pre-computed evidence lines (MATCH/FILE_COUNT/TERM_COUNT) to inject under TASK
 * @returns {string} the full pack (newline-joined, deterministic, ≤ MAX_LINES)
 */
export function buildFidelityPack(task, opts = {}) {
  if (typeof task !== 'string' || !task.trim()) {
    throw new TypeError('buildFidelityPack: task (string) is required');
  }
  const substrate = SUBSTRATES.includes(opts.substrate) ? opts.substrate : 'glm';
  const role = opts.role ? String(opts.role).replace(/[^a-z0-9_-]/gi, '') : '';
  const modelWording = SUBSTRATE_MODEL[substrate] || 'a YURI peer lane';
  const laneId = (typeof opts.laneId === 'string' && /^\d{2}[A-Z]{2}$/.test(opts.laneId)) ? opts.laneId : 'NNXX';
  const files = Array.isArray(opts.files) ? opts.files.map((f) => String(f)).filter(Boolean).slice(0, 8) : [];
  const xref = Array.isArray(opts.xrefEvidence) ? opts.xrefEvidence.map((e) => String(e).trim()).filter(Boolean) : [];

  const identityRole = role ? ` (role: ${role})` : '';
  const identity = [
    'You are a YURI NANO SWARM NODE — a full peer build/reasoning operator wearing the YURI framework.',
    `Identity: ${modelWording}${identityRole}. You are NOT Claude, Sonnet, Opus, or Rick. If asked who you are, say "a YURI nano-swarm node" — never claim to be Claude or any Anthropic model.`,
    'The operator is Marcel Spatz. You BUILD, reason, decide, and execute at the same grade as any lane. Truth is earned through the shared verification system (local evidence, gates, GitNexus impact, owner approval), not by fluency. Ground every claim; mark what is unverified.',
  ].join('\n');

  const nav = [
    'Investigate before building. Ground in the YURI corpus FIRST — it is the compounding private research center.',
    '  node _SYSTEM/Scripts/xref-query.mjs "<concept>" --top 200      # FTS5 + graph + GitNexus + spectrum (broad recall: add --scan N or --all)',
    '  node _SYSTEM/Scripts/capability-recall.mjs "<verb noun>"       # capability-first: reuse what exists, never rebuild',
    '  ai search "<query>"                                           # FTS5 over ~26k docs+code (the `ai` bin)',
    '  read_file / grep / list_dir / fetch_url                       # repo traversal + cited online verification (≥2 primary sources)',
    files.length ? 'Read these files first (caller-provided must-reads):' : '',
    ...files.map((f) => `  - ${f}`),
  ].filter(Boolean).join('\n');

  const evidence = [
    'Deterministic evidence lines are the only currency of a PASS:',
    '  TERM_COUNT term=<TERM> count=<N>',
    '  FILE_COUNT file=<PATH> count=<N>',
    '  MATCH file=<PATH> term=<TERM> line=<N> excerpt="<bounded text>"',
    'No PASS without TERM_COUNT / FILE_COUNT / MATCH proof. Model output is advisory_only=true, local_truth_claim=false until a local verifier proves otherwise. Separate claim from evidence; never assert a hypothesis as fact.',
  ].join('\n');

  const protectedPaths = [
    `Never read or write these surfaces (the dispatchers refuse them by design; you must not even attempt): ${PROTECTED_LIST.join(', ')}.`,
    'Also refuse: any API key, credential, or secret in any path. Use existing wrappers if you need their data — never a direct read.',
  ].join('\n');

  const capFirst = [
    'CAPABILITY-FIRST: before building anything, check whether it already exists. Run capability-recall.mjs and search the corpus. Reuse, extend, or wrap before authoring new. A duplicate of an existing capability is a defect.',
  ].join('\n');

  const mutation = [
    'MUTATION RULES (the dispatchers enforce these — behave so you never hit the guard):',
    '  - Scope writes to the minimum necessary files. Explicit pathspec only: `git add <paths>` + `git commit -- <paths>`.',
    '  - NEVER `git add .` or a bare `git commit` (sweeps a parallel session\'s staged files). NEVER force-push. No git mutation/commit/push from a worker — finalize is reserved for the owner/Opus lane.',
    '  - No destructive commands without explicit request. No dependency installs without owner approval. DISARMED-first: gate behind a flag; arming is owner-gated.',
    '  - HIGH/CRITICAL risk → surface for owner approval before proceeding. Adversarially verify (attack your own result) before calling work done.',
  ].join('\n');

  const ret = [
    'RETURN CONTRACT — every result MUST end with an UPPERCASE RESULT_LABEL:',
    `  ${laneId}_<DESCRIPTION>_<X|P|F>_PASS_COMMITTED`,
    'Grammar: LANE_ID = 2-digit + 2-letter (e.g. 08CW). DESCRIPTION = SCREAMING_SNAKE_CASE ≤60 chars. PASS_TYPE = X (full) | P (partial) | F (failed). Terminal = PASS_COMMITTED.',
    'Bounded output: compact structured reports, no raw dumps, no padding/flattery. Marker-only pass; failure-only verbose logs.',
  ].join('\n');

  const taskBlock = [
    'TASK:',
    task.trim(),
    xref.length ? '' : '',
    ...xref,
  ].filter((line, i, arr) => !(line === '' && (i === 0 || i === arr.length - 1 || arr[i - 1] === ''))).join('\n');

  const pack = [
    '# YURI WORKER-FIDELITY PACK — operate BY this. You are a peer operator, not a chatbot.',
    buildSection('IDENTITY', identity),
    buildSection('NAVIGATION', nav),
    buildSection('EVIDENCE GRAMMAR', evidence),
    buildSection('PROTECTED PATHS', protectedPaths),
    buildSection('CAPABILITY-FIRST', capFirst),
    buildSection('MUTATION RULES', mutation),
    buildSection('RETURN CONTRACT', ret),
    buildSection('TASK', taskBlock),
  ].join('\n\n');

  // Hard guarantee: deterministic + ≤ MAX_LINES. If a caller over-stuffed it, surface the violation
  // rather than silently truncating (a truncated contract is worse than a loud error).
  const lines = pack.split('\n');
  if (lines.length > MAX_LINES) {
    throw new Error(`buildFidelityPack: pack exceeded MAX_LINES (${lines.length} > ${MAX_LINES}). Reduce files/xrefEvidence or raise MAX_LINES.`);
  }
  return pack;
}

// ── selftest ──────────────────────────────────────────────────────────────────────
/**
 * Deterministic self-test: asserts every section header is present exactly once and the pack stays
 * under MAX_LINES. Returns { ok, checks, lineCount, failures }.
 * @param {object} [opts]  passed to buildFidelityPack for the sample pack
 * @returns {{ok:boolean, checks:Array<{name:string,pass:boolean,detail?:string}>, lineCount:number}}
 */
export function selftest(opts = {}) {
  const checks = [];
  const sample = buildFidelityPack('Sample task: build a caching module with tests.', {
    substrate: 'glm', role: 'engineer', laneId: '08CW',
    files: ['_SYSTEM/Scripts/xref-query.mjs', 'package.json'],
    xrefEvidence: ['MATCH file=xref-query.mjs term=PASS_COMMITTED line=49 excerpt="KNOWN_TERMINALS"'],
    ...opts,
  });
  const lines = sample.split('\n');
  checks.push({ name: 'pack-under-MAX_LINES', pass: lines.length <= MAX_LINES, detail: `${lines.length}/${MAX_LINES}` });
  for (const h of SECTION_HEADERS) {
    const marker = `===== ${h} =====`;
    const count = (sample.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    checks.push({ name: `header-${h.toLowerCase().replace(/\s+/g, '-')}-present-once`, pass: count === 1, detail: `count=${count}` });
  }
  // determinism: same args → byte-identical pack (no Date/random)
  const dup = buildFidelityPack('Sample task: build a caching module with tests.', {
    substrate: 'glm', role: 'engineer', laneId: '08CW',
    files: ['_SYSTEM/Scripts/xref-query.mjs', 'package.json'],
    xrefEvidence: ['MATCH file=xref-query.mjs term=PASS_COMMITTED line=49 excerpt="KNOWN_TERMINALS"'],
    ...opts,
  });
  checks.push({ name: 'determinism-byte-identical', pass: sample === dup, detail: sample === dup ? 'identical' : 'DIFFERENT' });
  // RESULT_LABEL grammar: the RETURN CONTRACT shows the LANE_ID-prefixed template ending in
  // PASS_COMMITTED. The template uses placeholders (<DESCRIPTION>, <X|P|F>), so assert the
  // LANE_ID + terminal anchor, not a fully-concrete label.
  const rlOk = /08CW_<DESCRIPTION>_<X\|P\|F>_PASS_COMMITTED/.test(sample);
  checks.push({ name: 'result-label-grammar-sample-present', pass: rlOk });
  // protected path .env present
  checks.push({ name: 'protected-env-listed', pass: sample.includes('.env') });
  // task text echoed
  checks.push({ name: 'task-text-echoed', pass: sample.includes('Sample task: build a caching module') });
  // anti-Claude-impersonation wording present
  checks.push({ name: 'anti-claude-impersonation', pass: /NOT Claude/.test(sample) });
  const failures = checks.filter((c) => !c.pass);
  return { ok: failures.length === 0, checks, lineCount: lines.length, failures };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flagVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

  if (argv.includes('--selftest')) {
    const r = selftest();
    process.stdout.write(`worker-fidelity-pack selftest\n`);
    for (const c of r.checks) {
      process.stdout.write(`  [${c.pass ? 'PASS' : 'FAIL'}] ${c.name}${c.detail ? ` (${c.detail})` : ''}\n`);
    }
    process.stdout.write(`\nlineCount=${r.lineCount}/${MAX_LINES}  result=${r.ok ? 'SELFTEST_PASS' : 'SELFTEST_FAIL'}\n`);
    process.exit(r.ok ? 0 : 1);
  }

  const task = flagVal('--task');
  if (!task) {
    process.stderr.write('Usage: worker-fidelity-pack.mjs --task "..." [--substrate glm] [--role R] [--laneId 08CW] [--selftest]\n');
    process.exit(2);
  }
  const filesRaw = flagVal('--files');
  const files = filesRaw ? filesRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const pack = buildFidelityPack(task, {
    substrate: flagVal('--substrate') || 'glm',
    role: flagVal('--role') || undefined,
    laneId: flagVal('--laneId') || undefined,
    files,
  });
  process.stdout.write(`${pack}\n`);
}
