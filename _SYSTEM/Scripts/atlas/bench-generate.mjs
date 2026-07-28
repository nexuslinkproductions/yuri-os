#!/usr/bin/env node
// @capability: bench-generate
// @serves: L3 candidate question generation | verbatim third-party prose composition | deterministic seeded benchmark scaffolding
// @does: L3 of the n>=100 programmatic benchmark pipeline (Hermes assignment 2026-07-28): composes
//   CANDIDATE find questions from Phoenix's verbatim third-party semantic fragments (L1) + Atlas's
//   arithmetic allocation (L2) + the stratified pool (bench-pool). COMPOSITION, never authorship:
//   a question is a fixed interrogative FRAME (structural) with a slot filled by a VERBATIM
//   human-written fragment, unmodified. This tool may select and slot; it may never paraphrase,
//   summarize, or improve — the moment it rewrites a human sentence it has authored it, and it is
//   a measured lane. Deterministic: fixed seed, same inputs -> byte-identical output (asserted in
//   --test). No model calls anywhere in the generation path.
//   Pool candidates with NO usable source fragment are emitted as UNGENERATABLE with the reason —
//   the visible gap, never a silent drop (silent dropping is how the winnability filter got in).
//   Every candidate carries provenance {source_kind, source_path, source_line, frame_id} —
//   an unattributable question is unauditable and gets culled on sight.
// @use: node bench-generate.mjs [--sources=<path>] [--allocation=<path>] [--pool=<path>] [--out=<path>] [--test]
//   Defaults read bench-semantic-sources.json / bench-allocation.json / bench-pool.json from
//   _SYSTEM/state/atlas/ when present; --test runs on synthetic fixtures (no real inputs needed).
// @exports: FRAMES, generate, main

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STATE = path.join(REPO_ROOT, '_SYSTEM/state/atlas');
const DEFAULT_SOURCES = path.join(STATE, 'bench-semantic-sources.json');
const DEFAULT_ALLOC = path.join(STATE, 'bench-allocation.json');
const DEFAULT_POOL = path.join(STATE, 'bench-pool.json');
const DEFAULT_OUT = path.join(STATE, 'bench-candidates.jsonl');

const SEED = 1785240000; // fixed: same inputs -> byte-identical output, every lane, every run

/**
 * slotCompatible(text) — FRAGMENT HYGIENE FILTER (Hermes ruling 2026-07-28): SELECTION, not
 * rewriting. A frame slot needs a phrase a human would read as a question's content; harvested
 * fragments include 400-char markdown verdicts and raw JSON (measured on pilot g001/g003), and
 * no leakage or structure gate can see READABILITY. Eligibility rules, all structural and
 * deterministic — the filter decides WHICH fragment may fill a slot and never edits a byte:
 *   - single line (newlines make the question unreadable)
 *   - <= 160 chars. DERIVED, not nominated (Hermes refinement 2026-07-28): the authored find-40
 *     question distribution is min 31 / p50 107 / p90 144 / p95 148 / max 164 chars — 98% of
 *     real questions fall at or under 160, so the bound anchors to the only real-question
 *     distribution we have. PROVISIONAL: when s1_cold.jsonl lands, real cold questions supersede
 *     authored find-40 as the anchor and the bound is re-derived ('lock the rule, not the number').
 *   - not markdown/JSON-structured (starts with { [ # > | ` or '- ', or contains a "key": "value"
 *     JSON pair — raw structure, not prose)
 * Fragments failing hygiene go to the VISIBLE hygieneFiltered bucket with the reason. A candidate
 * whose ONLY fragments fail is UNGENERATABLE with reason 'hygiene' — counted SEPARATELY from
 * 'no source'. Harvest keeps everything (the record); the generator filters at use and reports.
 */
export function slotCompatible(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'non-string fragment' };
  const t = text;
  if (/\r?\n/.test(t)) return { ok: false, reason: 'multi-line fragment (unreadable in a slot)' };
  if (t.trim().length === 0) return { ok: false, reason: 'empty fragment' };
  if (t.length > 160) return { ok: false, reason: `over-long fragment (${t.length} chars > 160 — a slot is a phrase, not a paragraph)` };
  if (/^\s*[{[\]#>|`-]/.test(t)) return { ok: false, reason: 'markdown/JSON-structured opener' };
  if (/"[a-z0-9_]+"\s*:\s*"/i.test(t)) return { ok: false, reason: 'contains JSON key:value pair' };
  return { ok: true };
}

/**
 * normalizeSources(raw) — THE SEAM, reconciled explicitly. Phoenix's L1 emits
 *   {candidates: [{answer_path, sources: [{source_kind, source_path, source_line, text_verbatim}]}]}
 * while this generator composes from
 *   [{path, area, fragments: [{kind, source_path, source_line, text}]}].
 * Four lanes green in isolation do not make one pipeline; this adapter is the join, and it
 * PRESERVES provenance fields verbatim (source_kind -> kind, source_path/source_line untouched,
 * text_verbatim -> text). Accepts either shape so older fixtures keep working.
 */
export function normalizeSources(raw) {
  if (Array.isArray(raw)) return raw;
  const out = [];
  for (const c of (raw && Array.isArray(raw.candidates) ? raw.candidates : [])) {
    out.push({
      path: c.answer_path,
      area: c.area && typeof c.area === 'string' ? c.area : null,
      fragments: (Array.isArray(c.sources) ? c.sources : []).map((s) => ({
        kind: s.source_kind,
        source_path: s.source_path,
        source_line: s.source_line,
        text: s.text_verbatim,
      })),
    });
  }
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shared text normalizer (fragment identity + content-lint). */
function normText(t) {
  return String(t).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Interrogative frames — STRUCTURE ONLY. The verb register comes from the repo's own operational
 * question vocabulary (the existing benchmark's frames, generalized). Content never comes from
 * the frame; the frame_id is recorded per question for the G-FRAME-DIVERSITY gate.
 */
export const FRAMES = [
  { id: 'F1', text: 'where is {c} handled?' },
  { id: 'F2', text: 'what enforces {c}?' },
  { id: 'F3', text: 'what computes {c}?' },
  { id: 'F4', text: 'what guards {c}?' },
  { id: 'F5', text: 'what mediates {c}?' },
  { id: 'F6', text: 'what decides {c}?' },
  { id: 'F7', text: 'what aggregates {c}?' },
  { id: 'F8', text: 'what do I run to {c}?' },
  { id: 'F9', text: 'where does {c} live?' },
  { id: 'F10', text: 'which file owns {c}?' },
];

/**
 * generate({sources, allocation, pool}) — the composition pipeline.
 * sources:    [{ path, area, fragments: [{kind, source_path, source_line, text}] }]  (Phoenix L1)
 * allocation: [{ area, count, difficulty? }]                                          (Atlas L2; optional —
 *             absent -> every pool candidate is targeted once)
 * pool:       bench-pool.json shape (path, kind, fts_reachable, basename_unique, area)
 *
 * Returns { candidates: [...], ungeneratable: [...] }. Deterministic byte-identical for the same
 * inputs: seeded shuffle of fragments, round-robin frames (frame index from the seeded stream).
 */
export function generate({ sources, allocation, pool, seed = SEED }) {
  const rng = mulberry32(seed);
  const byPath = new Map();
  for (const s of sources) byPath.set(s.path, s);

  // FRAGMENT DISCRIMINATION (Hermes 2026-07-28, artifact autopsy: ONE commit subject fed 198 of
  // 206 candidates — 96%). A semantic source must be SPECIFIC to its answer, not merely
  // ASSOCIATED with it: a commit subject attached to every file the commit touched describes the
  // CHANGE, not any one file. We spent the day guarding fragments TOO CLOSE to the answer
  // (leakage) and nothing on fragments TOO FAR to identify it. Rule: a fragment appearing in
  // MORE THAN ONE answer's source list is disqualified as semantic content for any of them.
  const fragmentAnswers = new Map(); // normalized text -> Set<answer path>
  for (const s of sources) {
    for (const f of s.fragments || []) {
      if (typeof f.text !== 'string') continue;
      const key = normText(f.text);
      if (!fragmentAnswers.has(key)) fragmentAnswers.set(key, new Set());
      fragmentAnswers.get(key).add(s.path);
    }
  }

  // Deterministic target list: allocation order if given, else pool order.
  const targets = [];
  if (allocation && allocation.length) {
    for (const a of allocation) {
      const members = pool.filter((p) => p.area === a.area);
      for (let i = 0; i < Math.min(a.count, members.length); i++) targets.push(members[i]);
    }
  } else {
    targets.push(...pool);
  }

  const candidates = [];
  const ungeneratable = [];
  const hygieneFiltered = [];
  const sourceClassFiltered = []; // S3 drops — separate accounting from hygiene (advisory)
  // KIND-QUOTA + CONTENT-HASHED FRAME state (restart-gate #4/#5): running kind counts across the
  // whole run (NEVER per-target, or the quota resets) and an FNV-1a hash for content-derived
  // frame assignment — the same fragment always gets the same frame, different fragments spread.
  const kindCounts = new Map();
  const hashText = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  for (const t of targets) {
    const src = byPath.get(t.path);
    const harvested = src && Array.isArray(src.fragments) ? src.fragments.filter((f) => typeof f.text === 'string' && f.text.trim().length > 0) : [];
    if (harvested.length === 0) {
      ungeneratable.push({ path: t.path, area: t.area, reason: src ? 'no usable fragments (all empty)' : 'no semantic source for path' });
      continue;
    }
    const usable = [];
    let nHygiene = 0;
    let nDisc = 0;
    let nSourceClass = 0;
    for (const f of harvested) {
      // S3 DROPPED as a semantic source (Hermes ruling 2026-07-28, structural): commit subjects
      // are squeezed — generic subjects fail specificity, identifying subjects fail leakage, and
      // git's diff-filter=A counts restore-after-delete as births (901/920 recoverable paths cite
      // ONE 5000-file recovery commit). The usable band measured 1.1%. S3 may return later ONLY
      // as negative examples for gate probes — never as question content.
      if (f.kind === 'S3') {
        nSourceClass++;
        sourceClassFiltered.push({ path: t.path, reason: 'S3 dropped as semantic source (structural squeeze — no middle band)', source_kind: f.kind, source_path: f.source_path, source_line: f.source_line });
        continue;
      }
      const h = slotCompatible(f.text);
      if (!h.ok) {
        nHygiene++;
        hygieneFiltered.push({ path: t.path, reason: h.reason, source_kind: f.kind, source_path: f.source_path, source_line: f.source_line });
        continue;
      }
      const answers = fragmentAnswers.get(normText(f.text)) || new Set([t.path]);
      if (answers.size > 1) {
        nDisc++;
        hygieneFiltered.push({ path: t.path, reason: `non-discriminating fragment (attached to ${answers.size} answers — describes the change, not the file)`, source_kind: f.kind, source_path: f.source_path, source_line: f.source_line });
        continue;
      }
      usable.push(f);
    }
    if (usable.length === 0) {
      // Separate accounting per exclusion class (advisory): hygiene-only, discrimination-only,
      // or mixed — never collapsed into one bucket line.
      const reason = (nHygiene + nDisc + nSourceClass) === 0 ? 'no usable fragments'
        : nHygiene > 0 && nDisc === 0 && nSourceClass === 0 ? `hygiene: all ${harvested.length} fragment(s) failed slot-compatibility`
        : nDisc > 0 && nHygiene === 0 && nSourceClass === 0 ? `discrimination: all ${harvested.length} fragment(s) non-specific (attached to >1 answer)`
        : nSourceClass > 0 && nHygiene === 0 && nDisc === 0 ? `source-class: S3-only supply (dropped as a semantic source)`
        : `mixed: ${nHygiene} hygiene + ${nDisc} non-discriminating + ${nSourceClass} source-class of ${harvested.length} fragment(s)`;
      ungeneratable.push({ path: t.path, area: t.area, reason });
      continue;
    }
    // KIND-QUOTA (restart-gate #4): choose the least-used KIND first (min running count, ties by
    // kind name ascending — deterministic), THEN a seeded pick among that kind's fragments. The
    // previous fragment-weighted tie-break let 1 S2 + 10 S3 fragments pick S3 ~91% of the time —
    // the same monoculture pump wearing a quota's name (advisory 2026-07-28).
    const byKind = new Map();
    for (const f of usable) {
      if (!byKind.has(f.kind)) byKind.set(f.kind, []);
      byKind.get(f.kind).push(f);
    }
    let chosenKind = null;
    let bestCount = Infinity;
    for (const k of [...byKind.keys()].sort()) {
      const c = kindCounts.get(k) || 0;
      if (c < bestCount) { bestCount = c; chosenKind = k; }
    }
    const kindPool = byKind.get(chosenKind);
    const frag = kindPool[Math.floor(rng() * kindPool.length)];
    const frame = FRAMES[hashText(normText(frag.text)) % FRAMES.length];
    kindCounts.set(frag.kind, (kindCounts.get(frag.kind) || 0) + 1);
    const content = frag.text; // STRICTLY VERBATIM — not even trim(). The filter selects;
    // nothing in this pipeline edits a harvested byte (advisory 2026-07-28).
    candidates.push({
      id: null, // assigned after deterministic sort
      q: frame.text.replace('{c}', content),
      expect: [t.path],
      provenance: { source_kind: frag.kind, source_path: frag.source_path, source_line: frag.source_line, frame_id: frame.id },
      fragment: frag.text, // verbatim duplicate for audit/lint — refute passes and content-lint
      labels: { fts_reachable: t.fts_reachable, basename_unique: t.basename_unique, area: t.area },
    });
  }
  // Deterministic pre-assignment sort: expect path, then q.
  candidates.sort((a, b) => a.expect[0].localeCompare(b.expect[0]) || a.q.localeCompare(b.q));

  // G-QUESTION-DETERMINACY (restart-gate #2): each distinct question text must map to exactly ONE
  // expect-set. The measured artifact: 10 of 18 texts had multiple expects, max 24 — every arm
  // would score ~0 while it looks like 'navigation is hard'. A colliding text supports NOTHING:
  // every candidate in an indeterminate group is rejected (zero survivors, never one list-order
  // winner — same rule as fragment disqualification). The lint's expectsByQ is the independent
  // REPORT of this property; this is the GATE.
  const byQuestion = new Map();
  for (const c of candidates) {
    const key = normText(c.q);
    if (!byQuestion.has(key)) byQuestion.set(key, []);
    byQuestion.get(key).push(c);
  }
  const determinate = [];
  for (const [q, group] of byQuestion) {
    const expects = new Set(group.map((c) => c.expect[0]));
    if (expects.size <= 1) { determinate.push(...group); continue; }
    for (const c of group) {
      ungeneratable.push({ path: c.expect[0], area: c.labels.area, reason: `question-indeterminacy: text maps to ${expects.size} different answers (zero survivors — a text with two truths supports none)` });
    }
  }
  determinate.forEach((c, i) => { c.id = `g${String(i + 1).padStart(3, '0')}`; });
  return { candidates: determinate, ungeneratable, hygieneFiltered, sourceClassFiltered };
}

function runSelfTest() {
  let pass = true;
  const check = (name, cond) => {
    console.log(`[bench-generate --test] ${name}: ${cond ? 'PASS' : 'FAIL'}`);
    if (!cond) pass = false;
  };
  const pool = [
    { path: 'pkg/alpha.mjs', kind: 'mjs', fts_reachable: true, basename_unique: true, area: 'area-a' },
    { path: 'pkg/beta.mjs', kind: 'mjs', fts_reachable: false, basename_unique: true, area: 'area-a' },
    { path: 'pkg/gamma.mjs', kind: 'mjs', fts_reachable: true, basename_unique: true, area: 'area-b' },
  ];
  const sources = [
    { path: 'pkg/alpha.mjs', area: 'area-a', fragments: [{ kind: 'commit-message', source_path: 'git log', source_line: 42, text: 'retry queue backoff under contention' }] },
    { path: 'pkg/beta.mjs', area: 'area-a', fragments: [] },
  ];
  const r1 = generate({ sources, allocation: [], pool });
  const r2 = generate({ sources, allocation: [], pool });
  check('deterministic: byte-identical across runs', JSON.stringify(r1) === JSON.stringify(r2));
  check('ungeneratable bucket is VISIBLE with reason (never a silent drop)', r1.ungeneratable.length === 2 && r1.ungeneratable.every((u) => typeof u.reason === 'string'));
  check('candidates carry mandatory provenance', r1.candidates.every((c) => c.provenance && c.provenance.source_kind && c.provenance.frame_id && typeof c.provenance.source_line === 'number'));
  const alpha = r1.candidates.find((c) => c.expect[0] === 'pkg/alpha.mjs');
  check('question content is the VERBATIM fragment inside a fixed frame', alpha && alpha.q.includes('retry queue backoff under contention') && FRAMES.some((f) => alpha.q === f.text.replace('{c}', 'retry queue backoff under contention')));
  check('labels ride through from the pool', alpha && alpha.labels.fts_reachable === true);

  // THE SEAM: Phoenix L1 shape adapts with provenance preserved verbatim.
  const phoenixShape = { candidates: [{ answer_path: 'pkg/alpha.mjs', sources: [{ source_kind: 'S2', source_path: 'docs/x.md', source_line: 9, text_verbatim: 'queue backoff under contention' }] }] };
  const adapted = normalizeSources(phoenixShape);
  const seamOk = adapted.length === 1 && adapted[0].path === 'pkg/alpha.mjs'
    && adapted[0].fragments[0].kind === 'S2' && adapted[0].fragments[0].source_line === 9
    && adapted[0].fragments[0].text === 'queue backoff under contention';
  check('Phoenix L1 schema adapts with provenance preserved verbatim', seamOk);

  // Hygiene filter: markdown/JSON blobs and multi-line fragments are excluded at USE and stay
  // VISIBLE; a candidate whose only fragment fails hygiene is UNGENERATABLE with a hygiene reason.
  check('hygiene: multi-line blob rejected', slotCompatible('line one\nline two').ok === false);
  check('hygiene: JSON blob rejected', slotCompatible('{"layer": "X", "files": []}').ok === false);
  check('hygiene: clean phrase accepted', slotCompatible('retry queue backoff under contention').ok === true);
  check('hygiene: over-long rejected', slotCompatible('x'.repeat(200)).ok === false);
  const r3 = generate({ sources: [{ path: 'pkg/alpha.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'd.md', source_line: 1, text: '{"a": "b"}' }] }], allocation: [], pool });
  check('hygiene-only exclusion -> UNGENERATABLE with hygiene: prefix', r3.ungeneratable.some((u) => u.path === 'pkg/alpha.mjs' && u.reason.startsWith('hygiene:')) && !r3.candidates.some((c) => c.expect[0] === 'pkg/alpha.mjs'));

  // Discrimination-only accounting (separate class, never collapsed into hygiene). S2 kind —
  // S3 is now source-class rejected and would mask the discrimination path entirely.
  const dup = 'one shared subject for two answers';
  const rDisc = generate({
    sources: [
      { path: 'pkg/alpha.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'g', source_line: 1, text: dup }] },
      { path: 'pkg/beta.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'g', source_line: 1, text: dup }] },
    ],
    allocation: [],
    pool: [pool[0], pool[1]],
  });
  check('discrimination-only exclusion -> UNGENERATABLE with discrimination: prefix', rDisc.ungeneratable.every((u) => u.reason.startsWith('discrimination:')) && rDisc.ungeneratable.length === 2);

  // Mixed accounting: one hygiene fail + one discrimination fail on the same candidate.
  const rMix = generate({
    sources: [
      { path: 'pkg/alpha.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'd', source_line: 1, text: '{"x": "y"}' }, { kind: 'S2', source_path: 'g', source_line: 2, text: dup }] },
      { path: 'pkg/beta.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'g', source_line: 2, text: dup }] },
    ],
    allocation: [],
    pool: [pool[0]],
  });
  check('mixed exclusion -> explicit mixed reason', rMix.ungeneratable.some((u) => u.reason.startsWith('mixed:')));

  // VERBATIM means VERBATIM: edge whitespace rides through unchanged — selection, never editing.
  const r4 = generate({ sources: [{ path: 'pkg/alpha.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'd.md', source_line: 1, text: '  padded phrase  ' }] }], allocation: [], pool: [pool[0]] });
  check('edge-whitespace fragment passes through byte-identical', r4.candidates.length > 0 && r4.candidates[0].q.includes('  padded phrase  '));

  // DISCRIMINATION: a fragment attached to >1 answer is disqualified for ALL of them (the
  // fix(recovery) autopsy: one commit subject fed 96% of a real run). S2/S4 kinds — S3 is now
  // source-class rejected and would mask the discrimination path entirely.
  const shared = 'fix(recovery): restore backend release verification';
  const r5 = generate({
    sources: [
      { path: 'pkg/alpha.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'git-log', source_line: 1, text: shared }] },
      { path: 'pkg/beta.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'git-log', source_line: 1, text: shared }] },
      { path: 'pkg/gamma.mjs', area: 'b', fragments: [{ kind: 'S4', source_path: 'git-log', source_line: 2, text: 'unique commit for gamma only' }] },
    ],
    allocation: [],
    pool,
  });
  const sharedDisqualified = r5.hygieneFiltered.filter((h) => h.reason.includes('non-discriminating')).length === 2;
  const gammaGenerated = r5.candidates.some((c) => c.expect[0] === 'pkg/gamma.mjs');
  check('non-discriminating fragment disqualified for every attached answer', sharedDisqualified && gammaGenerated && !r5.candidates.some((c) => c.q.includes(shared)));

  // SOURCE-CLASS accounting: S3 fragments are excluded as source-class, counted separately,
  // never conflated with hygiene.
  const rSC = generate({
    sources: [{ path: 'pkg/alpha.mjs', area: 'a', fragments: [{ kind: 'S3', source_path: 'g', source_line: 1, text: 'any commit subject' }] }],
    allocation: [],
    pool: [pool[0]],
  });
  check('S3 excluded as source-class with separate accounting', rSC.sourceClassFiltered.length === 1 && rSC.hygieneFiltered.length === 0 && rSC.ungeneratable.some((u) => u.reason.startsWith('source-class:')));

  // PRECEDENCE: identical fragment text shared by two answers dies at DISCRIMINATION first —
  // normalized identity IS the fragment key, so G-QUESTION-DETERMINACY can only fire on shapes
  // the current composition cannot produce (different normalized fragments colliding into one
  // question text). It stays as defense-in-depth; the probe pins the precedence honestly.
  const rDet = generate({
    sources: [
      { path: 'pkg/alpha.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'd', source_line: 1, text: 'shared unique phrase for determinacy' }] },
      { path: 'pkg/beta.mjs', area: 'a', fragments: [{ kind: 'S2', source_path: 'e', source_line: 2, text: 'shared unique phrase for determinacy' }] },
    ],
    allocation: [],
    pool: [pool[0], pool[1]],
  });
  check('identical text in two answers dies at discrimination, zero survivors, determinacy uncredited', rDet.candidates.length === 0 && rDet.ungeneratable.every((u) => u.reason.startsWith('discrimination:')));
  console.log(`[bench-generate --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--test')) {
    process.exitCode = runSelfTest() ? 0 : 1;
    return;
  }
  const arg = (name, dflt) => {
    const a = argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : dflt;
  };
  const sourcesPath = arg('sources', DEFAULT_SOURCES);
  const allocPath = arg('allocation', DEFAULT_ALLOC);
  const poolPath = arg('pool', DEFAULT_POOL);
  const outPath = arg('out', DEFAULT_OUT);

  if (!existsSync(sourcesPath)) {
    console.error(`bench-generate: semantic sources not found at ${sourcesPath} — Phoenix's L1 output. Nothing to compose.`);
    process.exitCode = 2;
    return;
  }
  const sources = normalizeSources(JSON.parse(readFileSync(sourcesPath, 'utf8')));
  const allocation = existsSync(allocPath) ? JSON.parse(readFileSync(allocPath, 'utf8')) : [];
  const poolDoc = JSON.parse(readFileSync(poolPath, 'utf8'));
  const pool = Array.isArray(poolDoc) ? poolDoc : poolDoc.pool;

  const { candidates, ungeneratable, hygieneFiltered, sourceClassFiltered } = generate({ sources, allocation, pool });
  writeFileSync(outPath, candidates.map((c) => JSON.stringify(c)).join('\n') + '\n', 'utf8');

  // CONTENT-LINT (restart-gate #5, printed UNCONDITIONALLY): pipeline-integrity checks measured
  // deterministic/schema/provenance, and none measured ITEM VALIDITY — these numbers are the
  // human backstop for the failure mode nobody anticipated. '206 candidates, 18 distinct
  // questions, 7 fragments' would have stopped the 96%-monoculture artifact at a glance.
  const distinctQ = new Set(candidates.map((c) => normText(c.q)));
  const fragFanout = new Map();
  const kinds = {};
  const expectsByQ = new Map();
  for (const c of candidates) {
    const fk = normText(c.fragment || '');
    fragFanout.set(fk, (fragFanout.get(fk) || 0) + 1);
    kinds[c.provenance.source_kind] = (kinds[c.provenance.source_kind] || 0) + 1;
    const qk = normText(c.q);
    if (!expectsByQ.has(qk)) expectsByQ.set(qk, new Set());
    expectsByQ.get(qk).add(c.expect[0]);
  }
  const total = candidates.length || 1;
  const entropy = -Object.values(kinds).reduce((a, n) => { const p = n / total; return a + p * Math.log2(p); }, 0);
  const maxExpectsPerQ = Math.max(0, ...[...expectsByQ.values()].map((s) => s.size));
  console.log(`bench-generate: ${candidates.length} candidates -> ${outPath}`);
  console.log(`  [content-lint] candidates=${candidates.length} distinctQuestions=${distinctQ.size} distinctFragments=${fragFanout.size} topFragmentFanout=${Math.max(0, ...fragFanout.values())} maxExpectsPerQuestion=${maxExpectsPerQ}`);
  // Class-separated exclusion counts. The DETAIL bucket for hygiene+discrimination records is
  // shared (hygieneFiltered, keyed by reason); the COUNTS are still reported per class — a
  // combined detail list must never collapse the accounting (advisory 2026-07-28).
  const nHygieneOnly = hygieneFiltered.filter((h) => !h.reason.startsWith('non-discriminating')).length;
  const nDiscOnly = hygieneFiltered.length - nHygieneOnly;
  console.log(`  [content-lint] kindMix=${JSON.stringify(kinds)} kindEntropy=${entropy.toFixed(2)}bit ungeneratable=${ungeneratable.length} hygieneFiltered=${nHygieneOnly} discriminationFiltered=${nDiscOnly} sourceClassFiltered=${sourceClassFiltered.length}`);
  for (const u of ungeneratable.slice(0, 10)) console.log(`    ${u.path} — ${u.reason}`);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main();
