#!/usr/bin/env node
// @capability: atlas-loop
// @serves: measured self-improvement loop | tune atlas knobs against a frozen evaluator | propose-measure-keep-or-revert
// @does: mutates exactly ONE declared knob in the atlas checkpoint-generation pipeline per iteration,
//   regenerates the artifacts, scores them with `_SYSTEM/eval/atlas-score.mjs` in a FRESH child
//   process, keeps the change only if atlas_score strictly improved, otherwise reverts byte-exactly,
//   and appends one row per iteration to an append-only results log.
// @use: reach for this instead of hand-tuning atlas constants and eyeballing whether the number moved.
//   DISARMED by default: `--run` is required to mutate anything.
// @exports: KNOBS, resolveKnob, applyKnobToText, evaluateBranch, evaluateFreeze, formatResultRow,
//   assertNoBareMain, hashText, preflight, runLoop, selfTest, main
//
// ---------------------------------------------------------------------------------------------
// atlas-loop.mjs — the OPTIMIZER half of YURI's measured self-improvement loop.
//
// Doctrine: `_SYSTEM/yuri-origin.md` -> "## Loop Discipline". This file is that section's
// implementation. Read the doctrine before changing anything here; read `program.md` (next to this
// file) before OPERATING it.
//
// The single structural property that makes this a real loop rather than an agent agreeing with
// itself: THIS FILE CANNOT MODIFY THE THING THAT SCORES IT. `_SYSTEM/eval/` is frozen for the whole
// run. This script is enforcement LAYER 2 of the four named in the doctrine (OS file mode; this
// loop's refusal-to-start and per-iteration re-check; a git-level hook; harness permission config).
// Layer 2 binds every harness that runs THIS SCRIPT — it does not bind a process that never loads
// it, which is exactly why layers 1 and 3 exist and are not optional.
//
// ---------------------------------------------------------------------------------------------
// REPO QUIRK (verified, has produced wrong numbers twice)
// ---------------------------------------------------------------------------------------------
// A DIRECTORY named `main` exists at this repo's root. A bare `main` argument to a git command is
// ambiguous between the ref refs/heads/main and the path `main/`, and git silently resolves it as a
// PATH rather than erroring. Every git invocation in this file therefore uses the fully-qualified
// `refs/heads/main`, and `assertNoBareMain()` rejects a bare `main` argv token at the wrapper — a
// mechanical guard, not a comment asking future editors to remember.
//
// ---------------------------------------------------------------------------------------------
// USAGE
// ---------------------------------------------------------------------------------------------
//   node _SYSTEM/Scripts/atlas/atlas-loop.mjs                 # print the plan, mutate nothing, exit 0
//   node _SYSTEM/Scripts/atlas/atlas-loop.mjs --knobs          # show which knobs currently resolve
//   node _SYSTEM/Scripts/atlas/atlas-loop.mjs --dry-run        # full control flow, all effects stubbed
//   node _SYSTEM/Scripts/atlas/atlas-loop.mjs --test           # self-tests (no repo mutation)
//   node _SYSTEM/Scripts/atlas/atlas-loop.mjs --run --iters=8  # ARMED. requires an atlas/* branch.
//
// Exit codes: 0 = ok, 1 = loop aborted (preflight failure, freeze violation, leaky revert), 2 = usage error.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');

export const EVAL_DIR = '_SYSTEM/eval';
export const SCORER = '_SYSTEM/eval/atlas-score.mjs';
export const BENCHMARK = '_SYSTEM/eval/atlas-benchmark.jsonl';
export const RESULTS_PATH = '_SYSTEM/state/atlas/results.tsv';
export const SCRATCH_BRANCH_RE = /^atlas\/[A-Za-z0-9._-]+$/;
export const MAIN_REF = 'refs/heads/main';

export const RESULTS_HEADER = [
  'iso_timestamp', 'commit', 'knob', 'old_value', 'new_value',
  'atlas_score', 'hit@1', 'hit@3', 'verdict', 'note',
];

// ---------------------------------------------------------------------------------------------
// KNOB REGISTRY — declarative on purpose.
//
// Two other lanes are actively rewriting atlas-regions.mjs and atlas-resolve.mjs. Hardcoded line
// numbers or a "just edit line 89" strategy would be stale within the hour (it already was: BM25_K1
// and EDGE_KIND_WEIGHT both moved out from under this file mid-authoring). So a knob is a
// DECLARATION resolved against the file's current text at run time:
//
//   - every `sites` pattern must match EXACTLY ONCE in the file, or the knob is UNRESOLVED
//   - all sites of one knob must currently hold the SAME value, or the knob is INCONSISTENT
//   - an unresolved/inconsistent knob is SKIPPED and reported, never silently guessed at
//   - a knob whose file has vanished is UNRESOLVED, not a crash
//
// `sites` is a list because one logical knob can have more than one literal (a default repeated in
// the library entry point and the CLI entry point). Single-knob discipline means ONE KNOB per
// iteration — all of that knob's sites move together, and the post-mutation diff is checked to
// confirm no OTHER knob's site moved.
//
// ADDING A KNOB: see program.md -> "Adding a knob". Do not add one whose value the evaluator can
// see, and do not add one that changes what the benchmark asks.
// ---------------------------------------------------------------------------------------------

export const KNOBS = [
  {
    id: 'spectral_k',
    file: '_SYSTEM/Scripts/atlas/atlas-build.mjs',
    type: 'int',
    candidates: [8, 10, 12, 16, 20, 24, 32],
    rebuild: ['build'],
    sites: [
      /(const k = opts\.k \?\? )(\d+)/,
      /(const k = kArg \? Number\(kArg\.slice\(4\)\) : )(\d+)/,
    ],
    why: 'Spectral cluster count. Too low -> one dominant blob region; too high -> singleton regions '
       + 'that carry no navigational information. Both failure modes are visible in atlas-build\'s own '
       + 'fragmented/dominant summary, but only the benchmark says which trade actually helps a lookup.',
  },
  {
    id: 'max_doc_refs',
    file: '_SYSTEM/Scripts/atlas/atlas-edges.mjs',
    type: 'int',
    candidates: [10, 20, 40, 80, 160],
    rebuild: ['edges', 'build'],
    sites: [/(const DEFAULT_MAX_DOC_REFS = )(\d+)/],
    why: 'Cap on how many path references a single document may contribute as edges. An index or a '
       + 'registry file names hundreds of paths; uncapped, it becomes a hub that connects everything to '
       + 'everything and dissolves region structure. The cap is a real trade, not a safety margin.',
  },
  {
    id: 'capability_membership_cap',
    file: '_SYSTEM/Scripts/atlas/atlas-edges.mjs',
    type: 'int',
    candidates: [5, 10, 20, 40],
    rebuild: ['edges', 'build'],
    sites: [/(const CAPABILITY_MEMBERSHIP_CAP = )(\d+)/],
    why: 'A capability with N members contributes O(N^2) pairwise edges. The cap bounds that blow-up; '
       + 'raising it densifies capability-shaped clusters, lowering it lets dependency edges dominate.',
  },
  // --- knobs below live in files two other lanes are rewriting right now. They are declared, not
  // --- assumed: each is UNRESOLVED-tolerant and will simply be skipped until its pattern matches.
  {
    id: 'edge_weight_calls',
    file: '_SYSTEM/Scripts/atlas/atlas-regions.mjs',
    type: 'float',
    candidates: [0.6, 0.8, 1.0, 1.25, 1.5],
    rebuild: ['build'],
    sites: [/(\bcalls: )([0-9.]+)(,)/],
    why: 'Semantic weight of a call edge in region clustering, relative to reads/imports/references.',
  },
  {
    id: 'edge_weight_reads',
    file: '_SYSTEM/Scripts/atlas/atlas-regions.mjs',
    type: 'float',
    candidates: [0.5, 0.7, 0.85, 1.0],
    rebuild: ['build'],
    sites: [/(\breads: )([0-9.]+)(,)/],
    why: 'Semantic weight of a read edge in region clustering.',
  },
  {
    id: 'edge_weight_imports',
    file: '_SYSTEM/Scripts/atlas/atlas-regions.mjs',
    type: 'float',
    candidates: [0.4, 0.55, 0.7, 0.9],
    rebuild: ['build'],
    sites: [/(\bimports: )([0-9.]+)(,)/],
    why: 'Semantic weight of an import edge. Imports are the densest source; over-weighting them makes '
       + 'regions track the module graph instead of meaning.',
  },
  {
    id: 'edge_weight_references',
    file: '_SYSTEM/Scripts/atlas/atlas-regions.mjs',
    type: 'float',
    candidates: [0.1, 0.2, 0.3, 0.5],
    rebuild: ['build'],
    sites: [/(\breferences: )([0-9.]+)(,)/],
    why: 'Semantic weight of a doc-reference edge — the weakest and noisiest evidence of relatedness.',
  },
  {
    id: 'default_kind_weight',
    file: '_SYSTEM/Scripts/atlas/atlas-regions.mjs',
    type: 'float',
    candidates: [0.25, 0.5, 0.75],
    rebuild: ['build'],
    sites: [/(const DEFAULT_KIND_WEIGHT = )([0-9.]+)(;)/],
    why: 'Fallback weight for an edge kind not named in the weight table.',
  },
  {
    id: 'bm25_k1',
    file: '_SYSTEM/Scripts/atlas/atlas-resolve.mjs',
    type: 'float',
    candidates: [0.6, 0.9, 1.2, 1.6, 2.0],
    rebuild: [],
    sites: [/(const BM25_K1 = )([0-9.]+)(;)/],
    why: 'BM25 term-frequency saturation. Checkpoint documents are 5-25 identifier tokens, not prose, '
       + 'so the prose-tuned default is a hypothesis here, not a settled value.',
  },
  {
    id: 'bm25_b',
    file: '_SYSTEM/Scripts/atlas/atlas-resolve.mjs',
    type: 'float',
    candidates: [0.0, 0.25, 0.5, 0.75, 1.0],
    rebuild: [],
    sites: [/(const BM25_B = )([0-9.]+)(;)/],
    why: 'BM25 length normalisation strength. Measured, not assumed: see the MEASURED ALTERNATIVES '
       + 'block in atlas-resolve.mjs.',
  },
];

// Regeneration stages, in dependency order. A knob declares the EARLIEST stage it invalidates; the
// loop runs that stage and every stage after it.
export const STAGES = [
  { id: 'identity', argv: ['_SYSTEM/Scripts/atlas/atlas-identity.mjs'] },
  { id: 'edges', argv: ['_SYSTEM/Scripts/atlas/atlas-edges.mjs'] },
  { id: 'build', argv: ['_SYSTEM/Scripts/atlas/atlas-build.mjs'] },
];

export function stagesFor(rebuild) {
  if (!rebuild || rebuild.length === 0) return [];
  const first = STAGES.findIndex((s) => rebuild.includes(s.id));
  if (first < 0) return [];
  return STAGES.slice(first);
}

// ---------------------------------------------------------------------------------------------
// GIT WRAPPER — with the bare-`main` guard wired in, not merely documented.
// ---------------------------------------------------------------------------------------------

/**
 * Reject a bare `main` token in a git argv. In THIS repo a root directory named `main` makes bare
 * `main` resolve as a pathspec, silently. Throws rather than returning a flag: a wrong-ref read is
 * exactly the class of failure that produces confident wrong numbers.
 */
export function assertNoBareMain(args) {
  for (const a of args) {
    if (a === 'main') {
      throw new Error(
        'refusing bare `main` in a git argv: a directory named `main` exists at repo root and git '
        + 'resolves the token as a PATH. Use refs/heads/main.',
      );
    }
  }
  return true;
}

function git(args, { cwd = REPO_ROOT, allowFail = false } = {}) {
  assertNoBareMain(args);
  try {
    const stdout = execFileSync('git', args, {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, code: 0, stdout, stderr: '' };
  } catch (err) {
    const res = {
      ok: false,
      code: typeof err?.status === 'number' ? err.status : -1,
      stdout: typeof err?.stdout === 'string' ? err.stdout : '',
      stderr: typeof err?.stderr === 'string' ? err.stderr : String(err?.message || err),
    };
    if (!allowFail) {
      throw new Error(`git ${args.join(' ')} failed (${res.code}): ${res.stderr.trim().slice(0, 400)}`);
    }
    return res;
  }
}

export function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

function readIfExists(abs) {
  try {
    return fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// KNOB RESOLUTION + MUTATION (pure text functions — unit-testable without touching the repo)
// ---------------------------------------------------------------------------------------------

/**
 * Render a candidate as source text. A float knob keeps a decimal point (`1` -> `1.0`) so the
 * written source stays readable AND the site regex keeps matching the same shape it was written
 * for. An int knob is rendered bare.
 */
export function formatValue(knob, v) {
  if (knob.type === 'float') {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return Number.isInteger(n) ? n.toFixed(1) : String(n);
  }
  return String(v);
}

/** Two knob values are the same setting when they are numerically equal (or textually, if not numeric). */
export function sameValue(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

/**
 * Resolve a knob against file text.
 * -> { status: 'resolved'|'unresolved'|'inconsistent', value, matches:[{index,length,raw}], reason }
 */
export function resolveKnobInText(knob, text) {
  if (typeof text !== 'string') {
    return { status: 'unresolved', reason: 'file not readable', matches: [] };
  }
  const matches = [];
  for (const re of knob.sites) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    const found = [...text.matchAll(global)];
    if (found.length !== 1) {
      return {
        status: 'unresolved',
        reason: `site /${re.source}/ matched ${found.length} times (need exactly 1)`,
        matches: [],
      };
    }
    matches.push({ index: found[0].index, length: found[0][0].length, raw: found[0][0], value: found[0][2] });
  }
  const values = [...new Set(matches.map((m) => m.value))];
  if (values.length !== 1) {
    return { status: 'inconsistent', reason: `sites disagree: ${values.join(' vs ')}`, matches };
  }
  return { status: 'resolved', value: values[0], matches };
}

/**
 * Apply a new value to every site of exactly ONE knob.
 * -> { ok, text, oldValue, newValue, changedSites, reason }
 * Refuses when the knob is unresolved, when the value is unchanged, or when the resulting text
 * differs from the input anywhere outside the knob's own declared sites.
 */
export function applyKnobToText(knob, text, rawNewValue) {
  const res = resolveKnobInText(knob, text);
  if (res.status !== 'resolved') {
    return { ok: false, reason: `knob ${knob.id} ${res.status}: ${res.reason}` };
  }
  const oldValue = res.value;
  const newValue = formatValue(knob, rawNewValue);
  // No-op check is NUMERIC, not textual: "1.0" and "1" are the same knob setting, and rewriting
  // one into the other would burn an iteration on a diff that changes no behaviour.
  if (sameValue(oldValue, newValue)) {
    return { ok: false, reason: `knob ${knob.id} already at ${oldValue}` };
  }
  let out = text;
  // Rewrite from the last match backwards so earlier indices stay valid.
  const ordered = res.matches.slice().sort((a, b) => b.index - a.index);
  for (const m of ordered) {
    const replaced = m.raw.replace(String(oldValue), String(newValue));
    if (replaced === m.raw) {
      return { ok: false, reason: `knob ${knob.id}: value substitution was a no-op at index ${m.index}` };
    }
    out = out.slice(0, m.index) + replaced + out.slice(m.index + m.length);
  }
  const delta = diffCharSpans(text, out);
  if (delta.spans !== res.matches.length) {
    return {
      ok: false,
      reason: `knob ${knob.id}: mutation touched ${delta.spans} region(s), expected ${res.matches.length}`,
    };
  }
  return { ok: true, text: out, oldValue, newValue: String(newValue), changedSites: res.matches.length };
}

/** Count contiguous differing spans between two strings (line-granular). Used to police blast radius. */
export function diffCharSpans(a, b) {
  const la = a.split('\n');
  const lb = b.split('\n');
  if (la.length !== lb.length) return { spans: Infinity, lines: Math.abs(la.length - lb.length) };
  let spans = 0;
  let lines = 0;
  let inSpan = false;
  for (let i = 0; i < la.length; i++) {
    if (la[i] !== lb[i]) {
      lines++;
      if (!inSpan) { spans++; inSpan = true; }
    } else {
      inSpan = false;
    }
  }
  return { spans, lines };
}

/**
 * Confirm a mutation touched exactly one knob: the target knob's sites moved and no other knob
 * declared in the same file changed value.
 */
export function assertSingleKnob(knob, beforeText, afterText, registry = KNOBS) {
  const siblings = registry.filter((k) => k.file === knob.file && k.id !== knob.id);
  for (const sib of siblings) {
    const b = resolveKnobInText(sib, beforeText);
    const a = resolveKnobInText(sib, afterText);
    if (b.status === 'resolved' && a.status === 'resolved' && b.value !== a.value) {
      return { ok: false, reason: `mutation of ${knob.id} also changed sibling knob ${sib.id} (${b.value} -> ${a.value})` };
    }
    if (b.status === 'resolved' && a.status !== 'resolved') {
      return { ok: false, reason: `mutation of ${knob.id} broke resolution of sibling knob ${sib.id}` };
    }
  }
  return { ok: true };
}

export function resolveKnob(knob, repoRoot = REPO_ROOT) {
  const abs = path.join(repoRoot, knob.file);
  const text = readIfExists(abs);
  if (text === null) return { ...resolveKnobInText(knob, null), knob: knob.id, file: knob.file };
  return { ...resolveKnobInText(knob, text), knob: knob.id, file: knob.file };
}

export function resolveAllKnobs(repoRoot = REPO_ROOT, registry = KNOBS) {
  return registry.map((k) => ({ spec: k, ...resolveKnob(k, repoRoot) }));
}

// ---------------------------------------------------------------------------------------------
// PREFLIGHT — pure evaluators first (testable), live wrappers after.
// ---------------------------------------------------------------------------------------------

/** Branch gate: never main, must look like a scratch branch. */
export function evaluateBranch(branch) {
  if (!branch || branch === 'HEAD') {
    return { ok: false, code: 'DETACHED', message: 'HEAD is detached. Create a scratch branch: git switch -c atlas/<topic>' };
  }
  if (branch === 'main') {
    return {
      ok: false,
      code: 'ON_MAIN',
      message: 'refusing to run on main. Create a scratch branch first:\n'
             + '    git switch -c atlas/<topic>\n'
             + 'The loop commits and hard-resets on every iteration; main is not a place to do that.',
    };
  }
  if (!SCRATCH_BRANCH_RE.test(branch)) {
    return {
      ok: false,
      code: 'NOT_SCRATCH',
      message: `branch "${branch}" is not a scratch branch. Expected ${SCRATCH_BRANCH_RE}.\n`
             + '    git switch -c atlas/<topic>',
    };
  }
  return { ok: true, code: 'OK', branch };
}

/**
 * Freeze gate. `porcelain` is the output of `git status --porcelain -- _SYSTEM/eval`; `blobs` maps
 * each frozen path to { head, worktree } sha. Empty porcelain AND matching blob hashes required.
 */
export function evaluateFreeze(porcelain, blobs = {}) {
  const dirty = String(porcelain || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (dirty.length) {
    return {
      ok: false,
      code: 'EVAL_DIRTY',
      message: `FROZEN EVALUATOR VIOLATION — ${EVAL_DIR}/ has uncommitted changes:\n`
             + dirty.map((d) => `      ${d}`).join('\n')
             + '\n    The evaluator must be immutable for the duration of a run. Commit or revert it, then restart.',
      dirty,
    };
  }
  for (const [p, pair] of Object.entries(blobs)) {
    if (!pair || !pair.head || !pair.worktree) {
      return { ok: false, code: 'EVAL_MISSING', message: `FROZEN EVALUATOR VIOLATION — cannot hash ${p} against HEAD`, dirty: [] };
    }
    if (pair.head !== pair.worktree) {
      return {
        ok: false,
        code: 'EVAL_MODIFIED',
        message: `FROZEN EVALUATOR VIOLATION — ${p} differs from HEAD (${pair.head.slice(0, 12)} != ${pair.worktree.slice(0, 12)})`,
        dirty: [],
      };
    }
  }
  return { ok: true, code: 'OK', dirty: [] };
}

function liveFreezeCheck() {
  const porcelain = git(['status', '--porcelain', '--', EVAL_DIR]).stdout;
  const blobs = {};
  for (const p of [SCORER, BENCHMARK]) {
    const head = git(['rev-parse', `HEAD:${p}`], { allowFail: true });
    const wt = git(['hash-object', path.join(REPO_ROOT, p)], { allowFail: true });
    blobs[p] = { head: head.ok ? head.stdout.trim() : null, worktree: wt.ok ? wt.stdout.trim() : null };
  }
  return evaluateFreeze(porcelain, blobs);
}

export function preflight({ repoRoot = REPO_ROOT, registry = KNOBS } = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, status: ok ? 'OK' : 'FAIL', detail });

  // 1. branch
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const b = evaluateBranch(branch);
  add('branch', b.ok, b.ok ? `on ${branch}` : b.message);

  // 2. main is genuinely reachable as a REF (proves we are reading refs/heads/main, not the dir)
  const mainRef = git(['rev-parse', '--verify', MAIN_REF], { allowFail: true });
  add('main-ref-resolvable', mainRef.ok, mainRef.ok ? `${MAIN_REF} = ${mainRef.stdout.trim().slice(0, 12)}` : `cannot resolve ${MAIN_REF}`);

  // 3. frozen evaluator
  const f = liveFreezeCheck();
  add('eval-frozen', f.ok, f.ok ? `${EVAL_DIR}/ matches HEAD` : f.message);

  // 4. scorer is runnable and its own self-check passes
  let scorerOk = false;
  let scorerDetail = '';
  try {
    const out = execFileSync(process.execPath, [path.join(repoRoot, SCORER), '--self-check'], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    });
    scorerOk = /result: PASS/i.test(out);
    scorerDetail = scorerOk ? 'atlas-score --self-check PASS' : `atlas-score --self-check did not pass:\n${out.trim()}`;
  } catch (err) {
    scorerDetail = `atlas-score --self-check failed to run: ${String(err?.stderr || err?.message || err).slice(0, 300)}`;
  }
  add('scorer-self-check', scorerOk, scorerDetail);

  // 5. knob surface is clean (a dirty knob file makes "revert to pre-iteration state" meaningless)
  const knobFiles = [...new Set(registry.map((k) => k.file))];
  const knobPorcelain = git(['status', '--porcelain', '--', ...knobFiles]).stdout
    .split('\n').map((l) => l.trim()).filter(Boolean);
  add('knob-surface-clean', knobPorcelain.length === 0,
    knobPorcelain.length === 0 ? `${knobFiles.length} knob file(s) clean`
      : `uncommitted changes in the knob surface — commit or stash first:\n${knobPorcelain.map((l) => `      ${l}`).join('\n')}`);

  // 6. at least one knob resolves
  const resolved = resolveAllKnobs(repoRoot, registry).filter((r) => r.status === 'resolved');
  add('knobs-resolvable', resolved.length > 0, `${resolved.length}/${registry.length} knobs resolve`);

  // 7. results log is appendable
  const resultsAbs = path.join(repoRoot, RESULTS_PATH);
  let logOk = false;
  let logDetail = '';
  try {
    fs.mkdirSync(path.dirname(resultsAbs), { recursive: true });
    fs.accessSync(path.dirname(resultsAbs), fs.constants.W_OK);
    logOk = true;
    logDetail = fs.existsSync(resultsAbs) ? `${RESULTS_PATH} exists (append-only)` : `${RESULTS_PATH} will be created`;
  } catch (err) {
    logDetail = `results log not writable: ${err.message}`;
  }
  add('results-log', logOk, logDetail);

  const failed = checks.filter((c) => c.status === 'FAIL');
  return { ok: failed.length === 0, checks, branch, resolvedKnobs: resolved };
}

// ---------------------------------------------------------------------------------------------
// RESULTS LOG — append-only. Never rewritten, never sorted, never de-duplicated.
// ---------------------------------------------------------------------------------------------

function sanitizeField(v) {
  return String(v === null || v === undefined ? '' : v).replace(/[\t\r\n]+/g, ' ').trim();
}

export function formatResultRow(row) {
  const fields = RESULTS_HEADER.map((h) => sanitizeField(row[h]));
  if (fields.length !== RESULTS_HEADER.length) throw new Error('row arity mismatch');
  return fields.join('\t');
}

export function appendResult(row, { repoRoot = REPO_ROOT, sink = null } = {}) {
  const line = formatResultRow(row);
  if (sink) { sink.push(line); return line; }
  const abs = path.join(repoRoot, RESULTS_PATH);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) fs.appendFileSync(abs, `${RESULTS_HEADER.join('\t')}\n`, 'utf8');
  fs.appendFileSync(abs, `${line}\n`, 'utf8');
  return line;
}

// ---------------------------------------------------------------------------------------------
// SNAPSHOT / BYTE-EXACT REVERT
//
// The atlas artifacts under _SYSTEM/state/atlas/ are GITIGNORED (.gitignore:476), so a
// `git reset --hard` does NOT restore them — it only restores the SOURCE. A revert therefore has
// two halves: reset the source, then regenerate the artifacts from that restored source. Both
// halves are verified. A revert that leaks contaminates every later iteration silently, which is
// why this is an assertion and not a log line.
// ---------------------------------------------------------------------------------------------

export function snapshotSources(files, { repoRoot = REPO_ROOT } = {}) {
  const out = {};
  for (const rel of files) {
    const text = readIfExists(path.join(repoRoot, rel));
    out[rel] = text === null ? null : hashText(text);
  }
  return out;
}

export function compareSnapshots(before, after) {
  const drift = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (before[k] !== after[k]) {
      drift.push({ file: k, before: before[k], after: after[k] });
    }
  }
  return { ok: drift.length === 0, drift };
}

// ---------------------------------------------------------------------------------------------
// EFFECTS — real vs stubbed. --dry-run swaps this object and exercises the identical control flow.
// ---------------------------------------------------------------------------------------------

function realEffects() {
  return {
    mode: 'real',
    readFile: (rel) => readIfExists(path.join(REPO_ROOT, rel)),
    writeFile: (rel, text) => fs.writeFileSync(path.join(REPO_ROOT, rel), text, 'utf8'),
    head: () => git(['rev-parse', 'HEAD']).stdout.trim(),
    commit: (paths, message) => {
      git(['add', '--', ...paths]);
      git(['commit', '-m', message, '--', ...paths]);
      return git(['rev-parse', 'HEAD']).stdout.trim();
    },
    // REVERT IS PATH-SCOPED, NEVER REPO-WIDE.
    // This was `git reset --hard <sha>` — repo-wide, no pathspec. Preflight only ever checked that
    // the KNOB files were clean, so a rejected iteration silently destroyed every OTHER modified
    // tracked file in the checkout (187 of them here at the time of the fix). Untracked files
    // survived, since `reset --hard` is not `clean` — but modified-tracked work did not, and the
    // byte-exact verification could not see the loss, because it only re-hashes knob files.
    // Found by adversarial review 2026-07-27. Four lanes and the orchestrator all walked past it:
    // each verified its own component, none modeled the revert against a SHARED dirty checkout.
    // Same shape as the sparse-checkout incident — a mechanism whose blast radius is wider than
    // its own safety check inspects.
    //
    // The obvious alternative, demanding a clean worktree before arming, is unattainable in this
    // repo and would only move the failure to "the loop can never start". Path isolation is
    // strictly better: it makes an unrelated dirty tree IRRELEVANT rather than forbidden.
    //
    // Three steps rather than one because git refuses a pathspec with --soft/--hard, and
    // `git reset <tree-ish> -- <paths>` cannot move HEAD:
    //   1. --soft   moves the branch pointer back, leaving the working tree entirely untouched
    //   2. checkout restores index+worktree for ONLY these paths
    //   3. reset --  unstages them, so the index matches HEAD again
    // Every step is pathspec-bounded except (1), which touches no files at all.
    revertPaths: (sha, paths) => {
      if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error('revertPaths refused: no pathspec given — a revert must never be repo-wide');
      }
      git(['reset', '--soft', sha]);
      git(['checkout', sha, '--', ...paths]);
      git(['reset', '--', ...paths]);
    },
    regenerate: (stages) => {
      const log = [];
      for (const s of stages) {
        execFileSync(process.execPath, [path.join(REPO_ROOT, ...s.argv[0].split('/'))], {
          cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
        });
        log.push(s.id);
      }
      return log;
    },
    score: () => runScorer(),
    appendResult: (row) => appendResult(row),
    freezeCheck: () => liveFreezeCheck(),
  };
}

// The stub must model git faithfully enough to be worth running. Specifically: `reset --hard
// <sha>` restores the tree AS OF THAT COMMIT — which INCLUDES every earlier KEPT iteration — it
// does not wipe back to the pre-loop tree. An earlier version of this stub cleared all state on
// reset, and the byte-exact check correctly flagged the resulting phantom drift on iteration 2.
// Keeping the stub honest is the whole point of --dry-run; a stub that lies is worse than none.
function stubEffects({ scores = null } = {}) {
  const BASE = 'dry000000000000000000000000000000000000';
  const history = new Map([[BASE, new Map()]]); // sha -> committed overlay (empty = as-on-disk)
  let files = new Map(); // working-tree overlay on top of HEAD's committed overlay
  const sink = [];
  let n = 0;
  let fakeHead = BASE;
  const overlayFor = (sha) => history.get(sha) || new Map();
  return {
    mode: 'dry-run',
    sink,
    readFile: (rel) => {
      if (files.has(rel)) return files.get(rel);
      const committed = overlayFor(fakeHead);
      if (committed.has(rel)) return committed.get(rel);
      return readIfExists(path.join(REPO_ROOT, rel));
    },
    writeFile: (rel, text) => { files.set(rel, text); },
    head: () => fakeHead,
    // Commit is PATHSPEC-BOUNDED, mirroring realEffects' `git commit -- <paths>`.
    // Previously this cleared the ENTIRE pending overlay, which meant an unrelated modified file
    // vanished at commit time rather than at revert time. Real git does not do that: committing
    // one pathspec leaves every other working-tree modification exactly where it was. Caught by
    // the 5c blast-radius test 2026-07-28 — the same class of stub infidelity already fixed once
    // in this file, in a different method.
    commit: (paths) => {
      const sha = `dry${String(++n).padStart(37, '0')}`;
      const scope = Array.isArray(paths) && paths.length ? paths : [...files.keys()];
      const merged = new Map(overlayFor(fakeHead));
      for (const rel of scope) if (files.has(rel)) merged.set(rel, files.get(rel));
      history.set(sha, merged);
      for (const rel of scope) files.delete(rel);   // only the committed paths leave the overlay
      fakeHead = sha;
      return sha;
    },
    // Models the PATH-SCOPED revert. The old stub cleared the entire pending overlay, which
    // faithfully mirrored the old repo-wide `reset --hard` — and that fidelity is exactly why the
    // stub must change too. Dropping only the named paths is what makes an unrelated pending edit
    // survive a revert in the dry run, so the dry run can actually demonstrate the isolation
    // rather than merely assert it.
    revertPaths: (sha, paths) => {
      if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error('revertPaths refused: no pathspec given — a revert must never be repo-wide');
      }
      for (const rel of paths) files.delete(rel);
      fakeHead = sha;
    },
    regenerate: (stages) => stages.map((s) => s.id),
    score: () => {
      // Deterministic synthetic trajectory: improves, then plateaus, then regresses — so the
      // dry run exercises BOTH the keep and the revert paths, not just the happy one.
      const seq = scores || [0.0800, 0.0950, 0.0950, 0.0700, 0.1100, 0.0900, 0.1100, 0.0850];
      const v = seq[n % seq.length];
      return { atlas_score: v, hit_at_1: v * 1.1, hit_at_3: v * 1.6, n: 40, raw: `(stub) atlas_score: ${v}` };
    },
    appendResult: (row) => appendResult(row, { sink }),
    freezeCheck: () => ({ ok: true, code: 'OK', dirty: [] }),
  };
}

/**
 * VERIFIER ISOLATION: a genuinely fresh child process, given nothing but the flags it needs.
 * No proposal, no knob name, no diff, no commit message, no reasoning. Only stdout is parsed.
 * Never import the scorer — an in-process import shares this module's state and its blind spots.
 */
export function runScorer({ repoRoot = REPO_ROOT, resolver = 'atlas' } = {}) {
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [path.join(repoRoot, SCORER), `--resolver=${resolver}`, '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME }, // no loop context leaks into the verifier
    });
  } catch (err) {
    throw new Error(`scorer failed: ${String(err?.stderr || err?.message || err).slice(0, 400)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (e) {
    throw new Error(`scorer did not emit valid JSON: ${e.message}`);
  }
  if (typeof parsed.atlas_score !== 'number') throw new Error('scorer output missing numeric atlas_score');
  return {
    atlas_score: parsed.atlas_score,
    hit_at_1: parsed.hit_at_1,
    hit_at_3: parsed.hit_at_3,
    n: parsed.n,
  };
}

// ---------------------------------------------------------------------------------------------
// PROPOSAL SCHEDULE — deterministic, one knob per iteration, no model in the loop.
// ---------------------------------------------------------------------------------------------

export function buildSchedule(resolvedKnobs, iters) {
  const queue = [];
  const pools = resolvedKnobs.map((r) => ({
    spec: r.spec,
    current: r.value,
    candidates: r.spec.candidates.filter((c) => !sameValue(formatValue(r.spec, c), r.value)),
    i: 0,
  }));
  // Round-robin across knobs so an early knob cannot monopolise the budget.
  let guard = 0;
  while (queue.length < iters && guard < iters * pools.length + pools.length) {
    guard++;
    let progressed = false;
    for (const p of pools) {
      if (queue.length >= iters) break;
      if (p.i >= p.candidates.length) continue;
      queue.push({ knob: p.spec, value: p.candidates[p.i++] });
      progressed = true;
    }
    if (!progressed) break;
  }
  return queue;
}

// ---------------------------------------------------------------------------------------------
// THE LOOP
// ---------------------------------------------------------------------------------------------

export function runLoop({ iters = 8, effects = null, repoRoot = REPO_ROOT, registry = KNOBS, log = console.log } = {}) {
  const fx = effects || realEffects();
  const dry = fx.mode === 'dry-run';

  // --- preflight (real mode only; dry-run reports it but does not gate on it, so the control flow
  // --- can be exercised on a dirty machine without arming anything).
  const pre = preflight({ repoRoot, registry });
  log(`\n== PREFLIGHT (${fx.mode}) ==`);
  for (const c of pre.checks) log(`  ${c.status.padEnd(4)} ${c.name} — ${c.detail}`);
  if (!pre.ok) {
    if (!dry) {
      log('\nABORT: preflight failed. Nothing was mutated.');
      return { ok: false, reason: 'preflight', iterations: [] };
    }
    log('\n  (dry-run: continuing past preflight failures to exercise control flow)');
  }

  const resolved = dry && !pre.resolvedKnobs.length
    ? resolveAllKnobs(repoRoot, registry).filter((r) => r.status === 'resolved')
    : pre.resolvedKnobs;
  if (!resolved.length) {
    log('\nABORT: no knob resolves against the current source. Nothing to tune.');
    return { ok: false, reason: 'no-knobs', iterations: [] };
  }

  const schedule = buildSchedule(resolved, iters);
  const knobFiles = [...new Set(registry.map((k) => k.file))];

  // Baseline: score the tree as it stands BEFORE any mutation. Every later comparison is against
  // the best score seen so far, not against the previous iteration — otherwise a slow drift
  // downward can be ratcheted in one "improvement" at a time.
  let best;
  try {
    best = fx.score().atlas_score;
  } catch (err) {
    log(`\nABORT: baseline scoring failed: ${err.message}`);
    return { ok: false, reason: 'baseline', iterations: [] };
  }
  log(`\n== BASELINE ==\n  atlas_score ${best.toFixed(4)}`);

  const iterations = [];
  log(`\n== LOOP (${schedule.length} iteration(s)) ==`);

  for (let i = 0; i < schedule.length; i++) {
    const { knob, value } = schedule[i];
    const tag = `[${i + 1}/${schedule.length}] ${knob.id}`;

    // FREEZE RE-CHECK — before every iteration, not just at start.
    const fz = fx.freezeCheck();
    if (!fz.ok) {
      log(`\n${fz.message}\nABORT at iteration ${i + 1}.`);
      return { ok: false, reason: 'freeze', iterations };
    }

    // 1. record git state + source snapshot
    const headBefore = fx.head();
    const snapBefore = {};
    for (const rel of knobFiles) {
      const t = fx.readFile(rel);
      snapBefore[rel] = t === null ? null : hashText(t);
    }

    // 2. mutate exactly ONE knob
    const beforeText = fx.readFile(knob.file);
    const applied = applyKnobToText(knob, beforeText, value);
    if (!applied.ok) {
      log(`  ${tag}: SKIP — ${applied.reason}`);
      iterations.push({ knob: knob.id, verdict: 'skipped', note: applied.reason });
      continue;
    }
    const single = assertSingleKnob(knob, beforeText, applied.text, registry);
    if (!single.ok) {
      log(`  ${tag}: REFUSED — ${single.reason}`);
      iterations.push({ knob: knob.id, verdict: 'refused', note: single.reason });
      continue;
    }
    fx.writeFile(knob.file, applied.text);

    // 3. commit to the scratch branch
    const commit = fx.commit([knob.file], `atlas-loop: ${knob.id} ${applied.oldValue} -> ${applied.newValue}`);

    // 4. regenerate artifacts, then score in a FRESH process
    let scored = null;
    let failNote = '';
    try {
      fx.regenerate(stagesFor(knob.rebuild));
      scored = fx.score();
    } catch (err) {
      failNote = `measurement failed: ${err.message.slice(0, 160)}`;
    }

    // 5. keep or revert. STRICT improvement only — equal reverts. Equal-keeps ratchet noise in.
    const improved = scored !== null && scored.atlas_score > best;
    let verdict;
    let note = failNote;

    if (improved) {
      verdict = 'kept';
      best = scored.atlas_score;
    } else {
      verdict = 'reverted';
      if (!note) note = scored === null ? 'no score' : `no improvement vs best ${best.toFixed(4)}`;
      // knobFiles is the ONLY pathspec a revert may touch. It is the same set the iteration
      // committed (see fx.commit above, also pathspec-bounded), so the revert is the exact inverse
      // of the mutation — nothing wider.
      fx.revertPaths(headBefore, knobFiles);
      // artifacts are gitignored — the revert did not restore them; rebuild from restored source
      try {
        fx.regenerate(stagesFor(knob.rebuild));
      } catch (err) {
        log(`\nABORT: post-revert regeneration failed at iteration ${i + 1}: ${err.message}`);
        return { ok: false, reason: 'revert-regen', iterations };
      }
      // 5b. REVERT MUST BE BYTE-EXACT
      const snapAfter = {};
      for (const rel of knobFiles) {
        const t = fx.readFile(rel);
        snapAfter[rel] = t === null ? null : hashText(t);
      }
      const cmp = compareSnapshots(snapBefore, snapAfter);
      const headAfter = fx.head();
      if (!cmp.ok || headAfter !== headBefore) {
        log('\nABORT: LEAKY REVERT — working tree is not byte-identical to the pre-iteration state.');
        for (const d of cmp.drift) log(`    ${d.file}: ${String(d.before).slice(0, 12)} -> ${String(d.after).slice(0, 12)}`);
        if (headAfter !== headBefore) log(`    HEAD: ${headBefore} -> ${headAfter}`);
        log('  Every subsequent measurement would be contaminated. Stopping.');
        return { ok: false, reason: 'leaky-revert', iterations };
      }
    }

    // 6. append (append-only; one row per iteration, including failures)
    const row = {
      iso_timestamp: new Date().toISOString(),
      commit: verdict === 'kept' ? commit : `${commit} (reverted)`,
      knob: knob.id,
      old_value: applied.oldValue,
      new_value: applied.newValue,
      atlas_score: scored ? scored.atlas_score.toFixed(4) : '',
      'hit@1': scored && typeof scored.hit_at_1 === 'number' ? scored.hit_at_1.toFixed(4) : '',
      'hit@3': scored && typeof scored.hit_at_3 === 'number' ? scored.hit_at_3.toFixed(4) : '',
      verdict,
      note,
    };
    fx.appendResult(row);
    iterations.push({ knob: knob.id, verdict, score: scored ? scored.atlas_score : null, note });

    log(`  ${tag}: ${applied.oldValue} -> ${applied.newValue}  score ${scored ? scored.atlas_score.toFixed(4) : '  n/a '}  ${verdict.toUpperCase()}${note ? ` (${note})` : ''}`);

    // FREEZE RE-CHECK — after every iteration too.
    const fzAfter = fx.freezeCheck();
    if (!fzAfter.ok) {
      log(`\n${fzAfter.message}\nABORT after iteration ${i + 1}.`);
      return { ok: false, reason: 'freeze', iterations };
    }
  }

  log(`\n== DONE ==\n  best atlas_score ${best.toFixed(4)}   kept ${iterations.filter((r) => r.verdict === 'kept').length}/${iterations.length}`);
  if (dry && fx.sink) {
    log(`\n== results.tsv rows that WOULD be appended (${fx.sink.length}) ==`);
    log(`  ${RESULTS_HEADER.join('\t')}`);
    for (const l of fx.sink) log(`  ${l}`);
  }
  return { ok: true, best, iterations };
}

// ---------------------------------------------------------------------------------------------
// PLAN (the default, disarmed output)
// ---------------------------------------------------------------------------------------------

function printPlan({ repoRoot = REPO_ROOT, registry = KNOBS, iters } = {}) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true }).stdout.trim();
  const resolvedAll = resolveAllKnobs(repoRoot, registry);
  const ok = resolvedAll.filter((r) => r.status === 'resolved');

  console.log(`atlas-loop.mjs — DISARMED. This run mutates nothing.

WHAT IT WOULD DO (--run):
  preflight (abort on any failure)
  for each of ${iters} iteration(s):
    1. record HEAD + hash every knob-surface file
    2. mutate exactly ONE knob
    3. commit it to the current atlas/* scratch branch
    4. regenerate the affected artifacts, then run ${SCORER} in a FRESH child process
    5. strictly improved -> keep;  equal or worse -> git reset --hard + regenerate + verify byte-exact
    6. append one row to ${RESULTS_PATH}
  the frozen evaluator (${EVAL_DIR}/) is re-verified against HEAD before AND after every iteration

CURRENT STATE:
  branch          ${branch || '(unknown)'} ${branch === 'main' ? '  <- would REFUSE to run' : ''}
  knobs resolved  ${ok.length}/${registry.length}

KNOBS:`);
  for (const r of resolvedAll) {
    const state = r.status === 'resolved' ? `= ${r.value}` : `${r.status.toUpperCase()} (${r.reason})`;
    console.log(`  ${r.spec.id.padEnd(28)} ${state}`);
    console.log(`    ${r.spec.file}   rebuild: [${r.spec.rebuild.join(', ') || 'none'}]`);
    if (r.status === 'resolved') console.log(`    candidates: ${r.spec.candidates.map((c) => formatValue(r.spec, c)).join(', ')}`);
  }
  console.log(`
TO ARM (owner-gated per the Self-Governance Charter — this script does not arm itself):
  git switch -c atlas/<topic>
  node ${path.relative(repoRoot, fileURLToPath(import.meta.url))} --dry-run
  node ${path.relative(repoRoot, fileURLToPath(import.meta.url))} --run --iters=${iters}

Read ${path.posix.join('_SYSTEM/Scripts/atlas', 'program.md')} before arming.`);
}

function printKnobs({ repoRoot = REPO_ROOT, registry = KNOBS } = {}) {
  const all = resolveAllKnobs(repoRoot, registry);
  for (const r of all) {
    console.log(`${r.status.padEnd(12)} ${r.spec.id.padEnd(28)} ${r.status === 'resolved' ? `= ${r.value}` : r.reason}`);
  }
  const ok = all.filter((r) => r.status === 'resolved').length;
  console.log(`\n${ok}/${all.length} resolved`);
  return ok > 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------
// SELF-TESTS — real assertions against synthetic inputs and a throwaway temp dir.
// Never touches the real repo state; never runs the loop for real.
// ---------------------------------------------------------------------------------------------

export function selfTest() {
  const cases = [];
  const check = (name, cond, detail = '') => cases.push({ name, pass: !!cond, detail });
  const eq = (name, actual, expected) => cases.push({
    name, pass: JSON.stringify(actual) === JSON.stringify(expected),
    detail: JSON.stringify(actual) === JSON.stringify(expected) ? '' : `expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`,
  });

  // --- 1. preflight rejects main branch -------------------------------------------------------
  eq('branch: main -> reject', evaluateBranch('main').ok, false);
  eq('branch: main -> ON_MAIN code', evaluateBranch('main').code, 'ON_MAIN');
  check('branch: main message tells operator how to make a scratch branch', /git switch -c atlas\//.test(evaluateBranch('main').message));
  eq('branch: detached HEAD -> reject', evaluateBranch('HEAD').ok, false);
  eq('branch: empty -> reject', evaluateBranch('').ok, false);
  eq('branch: feature/foo (non-scratch) -> reject', evaluateBranch('feature/foo').ok, false);
  eq('branch: atlas/tune-k -> accept', evaluateBranch('atlas/tune-k').ok, true);
  eq('branch: atlas/ (no name) -> reject', evaluateBranch('atlas/').ok, false);
  eq('branch: main-ish decoy "mainline" -> reject as non-scratch', evaluateBranch('mainline').ok, false);

  // --- 2. preflight rejects dirty eval dir ----------------------------------------------------
  eq('freeze: clean -> ok', evaluateFreeze('', {}).ok, true);
  eq('freeze: modified scorer -> abort', evaluateFreeze(' M _SYSTEM/eval/atlas-score.mjs\n').ok, false);
  eq('freeze: modified scorer -> EVAL_DIRTY', evaluateFreeze(' M _SYSTEM/eval/atlas-score.mjs\n').code, 'EVAL_DIRTY');
  eq('freeze: untracked file in eval -> abort', evaluateFreeze('?? _SYSTEM/eval/sneaky.mjs\n').ok, false);
  eq('freeze: modified benchmark -> abort', evaluateFreeze(' M _SYSTEM/eval/atlas-benchmark.jsonl\n').ok, false);
  eq('freeze: blob hash mismatch (clean porcelain) -> abort',
    evaluateFreeze('', { [SCORER]: { head: 'aaa', worktree: 'bbb' } }).code, 'EVAL_MODIFIED');
  eq('freeze: blob hashes equal -> ok',
    evaluateFreeze('', { [SCORER]: { head: 'aaa', worktree: 'aaa' } }).ok, true);
  eq('freeze: unhashable blob -> abort', evaluateFreeze('', { [SCORER]: { head: null, worktree: 'aaa' } }).code, 'EVAL_MISSING');

  // --- 3. results.tsv append is well-formed ---------------------------------------------------
  const row = {
    iso_timestamp: '2026-07-26T12:00:00.000Z', commit: 'abc123', knob: 'spectral_k',
    old_value: '14', new_value: '20', atlas_score: '0.0950', 'hit@1': '0.1000',
    'hit@3': '0.1500', verdict: 'kept', note: 'ok',
  };
  const line = formatResultRow(row);
  eq('results: 10 tab-separated fields', line.split('\t').length, 10);
  eq('results: column order matches header', line.split('\t')[2], 'spectral_k');
  eq('results: header arity matches row arity', RESULTS_HEADER.length, line.split('\t').length);
  check('results: no embedded newline', !/\n/.test(line));
  const dirtyRow = { ...row, note: 'line1\nline2\twith\ttabs' };
  const dirtyLine = formatResultRow(dirtyRow);
  eq('results: sanitizes embedded tabs/newlines in note', dirtyLine.split('\t').length, 10);
  check('results: sanitized note has no raw newline', !/\n/.test(dirtyLine));
  const sink = [];
  appendResult(row, { sink });
  appendResult({ ...row, verdict: 'reverted' }, { sink });
  eq('results: append-only sink grows, never rewrites', sink.length, 2);
  eq('results: first row untouched by second append', sink[0], line);

  // --- 4. knob mutation touches exactly one knob ----------------------------------------------
  const synthetic = [
    'const A = 1;',
    'const DEFAULT_MAX_DOC_REFS = 40;',
    'const CAPABILITY_MEMBERSHIP_CAP = 20;',
    'const B = 2;',
  ].join('\n');
  const knobDocRefs = KNOBS.find((k) => k.id === 'max_doc_refs');
  const knobCapCap = KNOBS.find((k) => k.id === 'capability_membership_cap');
  const r1 = resolveKnobInText(knobDocRefs, synthetic);
  eq('knob: resolves against synthetic source', r1.status, 'resolved');
  eq('knob: reads current value', r1.value, '40');
  const applied = applyKnobToText(knobDocRefs, synthetic, 80);
  eq('knob: apply succeeds', applied.ok, true);
  eq('knob: old value recorded', applied.oldValue, '40');
  eq('knob: new value recorded', applied.newValue, '80');
  eq('knob: exactly one line changed', diffCharSpans(synthetic, applied.text).lines, 1);
  eq('knob: sibling knob value untouched', resolveKnobInText(knobCapCap, applied.text).value, '20');
  eq('knob: single-knob assertion passes', assertSingleKnob(knobDocRefs, synthetic, applied.text).ok, true);
  // negative: a mutation that moves TWO knobs must be refused
  const twoKnobText = applied.text.replace('CAPABILITY_MEMBERSHIP_CAP = 20', 'CAPABILITY_MEMBERSHIP_CAP = 5');
  eq('knob: refuses a two-knob mutation', assertSingleKnob(knobDocRefs, synthetic, twoKnobText).ok, false);
  check('knob: two-knob refusal names the sibling', /capability_membership_cap/.test(assertSingleKnob(knobDocRefs, synthetic, twoKnobText).reason || ''));
  // negative: unresolved / ambiguous patterns
  eq('knob: absent pattern -> unresolved', resolveKnobInText(knobDocRefs, 'const NOTHING = 1;').status, 'unresolved');
  eq('knob: duplicated pattern -> unresolved (ambiguous)',
    resolveKnobInText(knobDocRefs, `${synthetic}\nconst DEFAULT_MAX_DOC_REFS = 40;`).status, 'unresolved');
  eq('knob: null text -> unresolved', resolveKnobInText(knobDocRefs, null).status, 'unresolved');
  eq('knob: no-op value -> refused', applyKnobToText(knobDocRefs, synthetic, 40).ok, false);
  // multi-site knob: both sites move together, and disagreeing sites are caught
  const kSpec = KNOBS.find((k) => k.id === 'spectral_k');
  const kText = 'x\n  const k = opts.k ?? 14;\ny\n  const k = kArg ? Number(kArg.slice(4)) : 14;\nz';
  eq('knob: multi-site resolves', resolveKnobInText(kSpec, kText).status, 'resolved');
  const kApplied = applyKnobToText(kSpec, kText, 20);
  eq('knob: multi-site apply changes both sites', kApplied.ok && diffCharSpans(kText, kApplied.text).lines, 2);
  check('knob: multi-site result has no stale 14', !/\?\? 14;/.test(kApplied.text) && !/: 14;/.test(kApplied.text));
  const kSkew = kText.replace('opts.k ?? 14', 'opts.k ?? 12');
  eq('knob: multi-site disagreement -> inconsistent', resolveKnobInText(kSpec, kSkew).status, 'inconsistent');

  // --- 4b. float value rendering + numeric no-op detection ------------------------------------
  // Regression: candidate 1.0 stringified to "1", which wrote `calls: 1,` and let a no-op
  // proposal (current "1.0" vs proposed "1") burn an iteration on a behaviourless diff.
  const floatKnob = KNOBS.find((k) => k.id === 'edge_weight_calls');
  eq('value: float 1.0 renders with a decimal point', formatValue(floatKnob, 1.0), '1.0');
  eq('value: float 0.85 renders unchanged', formatValue(floatKnob, 0.85), '0.85');
  eq('value: int knob renders bare', formatValue(KNOBS.find((k) => k.id === 'spectral_k'), 20), '20');
  eq('value: "1.0" and "1" are the same setting', sameValue('1.0', '1'), true);
  eq('value: "0.85" and "0.8" differ', sameValue('0.85', '0.8'), false);
  eq('value: non-numeric falls back to text compare', sameValue('bm25f', 'bm25f'), true);
  const floatSrc = '  calls: 1.0,\n  reads: 0.85,\n';
  eq('value: float knob resolves 1.0', resolveKnobInText(floatKnob, floatSrc).value, '1.0');
  eq('value: proposing 1.0 onto 1.0 is a refused no-op', applyKnobToText(floatKnob, floatSrc, 1.0).ok, false);
  const floatApplied = applyKnobToText(floatKnob, floatSrc, 1.25);
  eq('value: float mutation applies', floatApplied.ok, true);
  check('value: float mutation writes a decimal literal', /calls: 1\.25,/.test(floatApplied.text || ''));
  eq('value: float mutation leaves sibling alone', resolveKnobInText(KNOBS.find((k) => k.id === 'edge_weight_reads'), floatApplied.text).value, '0.85');
  const floatSched = buildSchedule([{ spec: floatKnob, value: '1.0' }], 5);
  check('value: schedule never re-proposes the current float value', floatSched.every((s) => !sameValue(formatValue(floatKnob, s.value), '1.0')));

  // --- 5. revert restores a byte-identical tree ------------------------------------------------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-loop-test-'));
  try {
    const relA = 'a.mjs';
    const relB = 'b.mjs';
    fs.writeFileSync(path.join(tmp, relA), synthetic, 'utf8');
    fs.writeFileSync(path.join(tmp, relB), 'const Z = 3;\n', 'utf8');
    const before = snapshotSources([relA, relB], { repoRoot: tmp });
    // mutate
    fs.writeFileSync(path.join(tmp, relA), applied.text, 'utf8');
    const mutated = snapshotSources([relA, relB], { repoRoot: tmp });
    eq('revert: mutation IS detected as drift', compareSnapshots(before, mutated).ok, false);
    eq('revert: drift names the mutated file', compareSnapshots(before, mutated).drift[0].file, relA);
    // restore
    fs.writeFileSync(path.join(tmp, relA), synthetic, 'utf8');
    const after = snapshotSources([relA, relB], { repoRoot: tmp });
    eq('revert: byte-identical restore -> no drift', compareSnapshots(before, after).ok, true);
    // near-miss: a single trailing newline is NOT byte-identical and must be caught
    fs.writeFileSync(path.join(tmp, relA), `${synthetic}\n`, 'utf8');
    const nearMiss = snapshotSources([relA, relB], { repoRoot: tmp });
    eq('revert: one-byte difference IS caught (not "close enough")', compareSnapshots(before, nearMiss).ok, false);
    // missing file is drift, not a crash
    fs.rmSync(path.join(tmp, relB));
    const missing = snapshotSources([relA, relB], { repoRoot: tmp });
    eq('revert: deleted file counted as drift', compareSnapshots(before, missing).drift.some((d) => d.file === relB), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // --- 5b. dry-run stub must model git faithfully ----------------------------------------------
  // Regression: the stub's resetHard cleared ALL state, so a revert in iteration 2 also discarded
  // iteration 1's KEPT commit and the byte-exact check reported phantom drift. A stub that
  // misrepresents git makes --dry-run actively misleading.
  {
    const fx = stubEffects();
    const rel = '_SYSTEM/Scripts/atlas/__stub_probe__.mjs';
    fx.writeFile(rel, 'v1');
    const kept = fx.commit([rel]);            // iteration 1: kept
    const beforeIter2 = fx.head();
    eq('stub: commit advances HEAD', kept === beforeIter2 && kept !== 'dry000000000000000000000000000000000000', true);
    eq('stub: kept value readable after commit', fx.readFile(rel), 'v1');
    fx.writeFile(rel, 'v2');                  // iteration 2: mutate
    fx.commit([rel]);
    fx.revertPaths(beforeIter2, [rel]);       // iteration 2: revert
    eq('stub: revert restores the KEPT value, not the pre-loop value', fx.readFile(rel), 'v1');
    eq('stub: revert restores HEAD', fx.head(), beforeIter2);
    eq('stub: unwritten file falls through to disk', fx.readFile('_SYSTEM/Scripts/atlas/atlas-loop.mjs') !== null, true);
  }

  // --- 5c. REVERT BLAST RADIUS -----------------------------------------------------------------
  // The defect this suite exists to prevent from returning: the revert was `git reset --hard`
  // repo-wide while preflight only checked knob files, so a rejected iteration destroyed every
  // OTHER modified tracked file. The byte-exact check could not detect it (knob files only).
  // Found by adversarial review 2026-07-27, after four lanes each verified their own component.
  {
    const fx = stubEffects();
    const knob = '_SYSTEM/Scripts/atlas/__blast_knob__.mjs';
    const bystander = '_SYSTEM/Scripts/atlas/__blast_bystander__.mjs';

    fx.writeFile(knob, 'k1');
    const base = fx.commit([knob]);
    fx.writeFile(bystander, 'UNRELATED-UNCOMMITTED-WORK');  // a dirty tracked file the loop must not own
    fx.writeFile(knob, 'k2');                                // the iteration's single-knob mutation
    fx.commit([knob]);
    fx.revertPaths(base, [knob]);

    eq('revert restores the knob file', fx.readFile(knob), 'k1');
    eq('revert does NOT touch an unrelated pending file', fx.readFile(bystander), 'UNRELATED-UNCOMMITTED-WORK');

    // A revert with no pathspec is the original bug. It must be structurally impossible, not
    // merely discouraged — so both effect objects refuse it rather than defaulting to repo-wide.
    let threwEmpty = false, threwMissing = false;
    try { fx.revertPaths(base, []); } catch { threwEmpty = true; }
    try { fx.revertPaths(base); } catch { threwMissing = true; }
    eq('revert refuses an empty pathspec', threwEmpty, true);
    eq('revert refuses a missing pathspec', threwMissing, true);

    // The real effects object must carry the identical guard — a stub-only guard protects nothing.
    let realThrew = false;
    try { realEffects().revertPaths('HEAD', []); } catch { realThrew = true; }
    eq('real effects refuse an empty pathspec too', realThrew, true);
    // Assert the API shape, not the source text. A regex over this file's own source cannot tell
    // code from prose — and self-matches its own pattern literal, which is how the first version
    // of this assertion failed. The behavioural guarantee is that the repo-wide entry point is
    // GONE from both effect objects, so no future call site can reach it by name.
    eq('real effects expose no repo-wide resetHard', 'resetHard' in realEffects(), false);
    eq('stub effects expose no repo-wide resetHard', 'resetHard' in stubEffects(), false);
  }

  // --- 6. bare-`main` guard (the repo quirk that produced wrong numbers twice) ------------------
  eq('git guard: rejects bare main', (() => { try { assertNoBareMain(['rev-list', '--count', 'main']); return 'no-throw'; } catch { return 'threw'; } })(), 'threw');
  eq('git guard: accepts refs/heads/main', assertNoBareMain(['rev-list', '--count', MAIN_REF]), true);
  eq('git guard: accepts main-containing but non-bare token', assertNoBareMain(['log', 'origin/main']), true);

  // --- 7. schedule + stage discipline ----------------------------------------------------------
  const fakeResolved = [
    { spec: KNOBS.find((k) => k.id === 'max_doc_refs'), value: '40' },
    { spec: KNOBS.find((k) => k.id === 'capability_membership_cap'), value: '20' },
  ];
  const sched = buildSchedule(fakeResolved, 4);
  eq('schedule: honours the iteration budget', sched.length, 4);
  eq('schedule: round-robins across knobs', sched[0].knob.id !== sched[1].knob.id, true);
  check('schedule: never proposes the current value', sched.every((s) => String(s.value) !== '40' || s.knob.id !== 'max_doc_refs'));
  eq('schedule: one knob per entry', sched.every((s) => s.knob && s.value !== undefined), true);
  eq('stages: edges knob rebuilds edges+build', stagesFor(['edges', 'build']).map((s) => s.id), ['edges', 'build']);
  eq('stages: build-only knob rebuilds build only', stagesFor(['build']).map((s) => s.id), ['build']);
  eq('stages: resolver knob rebuilds nothing', stagesFor([]).map((s) => s.id), []);

  // --- 8. registry integrity -------------------------------------------------------------------
  eq('registry: knob ids unique', new Set(KNOBS.map((k) => k.id)).size, KNOBS.length);
  check('registry: every knob declares candidates', KNOBS.every((k) => Array.isArray(k.candidates) && k.candidates.length > 0));
  check('registry: every knob declares sites', KNOBS.every((k) => Array.isArray(k.sites) && k.sites.length > 0));
  check('registry: every knob declares why', KNOBS.every((k) => typeof k.why === 'string' && k.why.length > 20));
  check('registry: no knob points into the frozen eval dir', KNOBS.every((k) => !k.file.startsWith(EVAL_DIR)));
  check('registry: every site regex has a value capture group', KNOBS.every((k) => k.sites.every((re) => /\(/.test(re.source))));

  const failed = cases.filter((c) => !c.pass);
  for (const c of cases) {
    process.stdout.write(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.pass || !c.detail ? '' : ` — ${c.detail}`}\n`);
  }
  process.stdout.write(`\nSELF-TEST: ${cases.length - failed.length}/${cases.length} passed, ${failed.length} failed\n`);
  return failed.length === 0;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

const HELP = `atlas-loop.mjs — measured self-improvement loop for the YURI Atlas pipeline

Usage:
  node _SYSTEM/Scripts/atlas/atlas-loop.mjs [options]

Modes (DISARMED by default — no flag means print the plan and exit without mutating):
  (none)          print the plan + current knob state, mutate nothing
  --knobs         list every declared knob and whether it currently resolves
  --dry-run       exercise the FULL control flow with every effect stubbed
  --test          run the self-tests (synthetic inputs + a temp dir only)
  --run           ARM the loop. Requires an atlas/* scratch branch and a clean, frozen ${EVAL_DIR}/

Options:
  --iters=N       iteration budget (default 8)
  --help          this message

Non-negotiables enforced here:
  - ${EVAL_DIR}/ is verified against HEAD before the first iteration and around EVERY iteration
  - refuses to run on main, or on any branch not matching ${SCRATCH_BRANCH_RE}
  - the scorer runs as a fresh child process and is told nothing about the proposal
  - exactly one knob moves per iteration; a two-knob mutation is refused
  - a revert must leave the tree byte-identical, or the loop stops
  - ${RESULTS_PATH} is append-only

Exit codes: 0 = ok, 1 = aborted, 2 = usage error.
`;

export function parseArgs(argv) {
  const out = { run: false, dryRun: false, test: false, knobs: false, help: false, iters: 8 };
  for (const a of argv) {
    if (a === '--run') out.run = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--test') out.test = true;
    else if (a === '--knobs') out.knobs = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--iters=')) out.iters = Number(a.slice('--iters='.length));
    else throw new Error(`unrecognized argument: ${a}`);
  }
  if (!Number.isInteger(out.iters) || out.iters < 1 || out.iters > 500) {
    throw new Error('--iters=N must be an integer in [1, 500]');
  }
  if (out.run && out.dryRun) throw new Error('--run and --dry-run are mutually exclusive');
  return out;
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`usage error: ${err.message}\n\n${HELP}`);
    return 2;
  }

  if (args.help) { process.stdout.write(HELP); return 0; }
  if (args.test) return selfTest() ? 0 : 1;
  if (args.knobs) return printKnobs();

  if (args.dryRun) {
    const res = runLoop({ iters: args.iters, effects: stubEffects() });
    console.log('\n(dry-run: no file was written, no commit made, no artifact regenerated, no row appended)');
    return res.ok ? 0 : 1;
  }

  if (args.run) {
    const res = runLoop({ iters: args.iters });
    return res.ok ? 0 : 1;
  }

  printPlan({ iters: args.iters });
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
