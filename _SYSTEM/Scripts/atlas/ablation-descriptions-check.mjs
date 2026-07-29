#!/usr/bin/env node
// @capability: ablation-descriptions-check
// @serves: ablation answer-echo gate | description contamination check | pre-audit gate
// @does: FAIL-CLOSED gate over _SYSTEM/Scripts/atlas/ablation-descriptions.json (Hermes
//   2026-07-28): no description may contain any find-40 expect path, expect basename, or a
//   near-paraphrase of any find-40 question. A description written with knowledge of the
//   question set measures marketing-copy alignment with the benchmark, not tool utility.
//   Near-paraphrase bar: token Jaccard >= 0.5 between a description's full text and any
//   question text (descriptions are short generic prose; 0.5 is deliberately conservative).
// @use: node _SYSTEM/Scripts/atlas/ablation-descriptions-check.mjs  -> exit 0 clean, 1 violation
// @exports: checkDescriptions

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DESCRIPTIONS = path.join(REPO_ROOT, '_SYSTEM/Scripts/atlas/ablation-descriptions.json');
const BENCHMARK = path.join(REPO_ROOT, '_SYSTEM/eval/atlas-benchmark.jsonl');
const NEAR_PARAPHRASE_JACCARD = 0.5;

function toks(s) {
  return new Set(String(s || '').toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []);
}

export async function checkDescriptions({ descriptionsPath = DESCRIPTIONS, benchmarkPath = BENCHMARK, repoRoot = REPO_ROOT, backendMap = null, rgRunner = null } = {}) {
  const doc = JSON.parse(readFileSync(descriptionsPath, 'utf8'));
  const items = readFileSync(benchmarkPath, 'utf8').trim().split('\n').filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
  const violations = [];

  // FAIL CLOSED ON SHAPE: an empty or malformed input must never read as PASS.
  const REQUIRED_LABELS = ['tool_a', 'tool_b', 'tool_c', 'tool_d', 'tool_e'];
  if (!doc.descriptions || typeof doc.descriptions !== 'object') violations.push('descriptions object missing');
  const labels = Object.keys(doc.descriptions || {});
  for (const req of REQUIRED_LABELS) if (!labels.includes(req)) violations.push(`required label ${req} missing`);
  for (const l of labels) if (!REQUIRED_LABELS.includes(l)) violations.push(`unexpected label ${l}`);
  if (!Array.isArray(items) || items.length === 0) violations.push('benchmark is empty — gate has nothing to check against (fail closed)');
  if (violations.length > 0) return { violations, checked: labels.length };

  const expectPaths = new Set();
  const expectBasenames = new Set();
  for (const it of items) {
    for (const e of it.expect || []) {
      const norm = String(e).replace(/^\.\//, '').replace(/\/+$/, '');
      expectPaths.add(norm.toLowerCase());
      expectBasenames.add(path.basename(norm).toLowerCase());
      expectBasenames.add(path.basename(norm).replace(/\.[a-z0-9]+$/i, '').toLowerCase());
    }
  }

  for (const [label, desc] of Object.entries(doc.descriptions || {})) {
    const full = [desc.purpose, desc.inputs, desc.outputs, desc.failure_behaviour].join(' ').toLowerCase();
    // 1. literal expect path or basename in the description text
    for (const p of expectPaths) {
      if (p.length >= 8 && full.includes(p)) violations.push(`${label}: contains expect path "${p}"`);
    }
    for (const b of expectBasenames) {
      if (b.length >= 5 && full.includes(b)) violations.push(`${label}: contains expect basename "${b}"`);
    }
    // 2. near-paraphrase of any question — PER-FIELD max Jaccard (the joined-text version
    // dilutes a paraphrase embedded in one field; measured on the family-2 fixture 2026-07-28).
    for (const it of items) {
      const qt = toks(it.q);
      if (qt.size === 0) continue;
      for (const field of ['purpose', 'inputs', 'outputs', 'failure_behaviour']) {
        const ft = toks(desc[field]);
        if (ft.size === 0) continue;
        let inter = 0;
        for (const t of ft) if (qt.has(t)) inter++;
        const union = ft.size + qt.size - inter;
        const jac = union > 0 ? inter / union : 0;
        if (jac >= NEAR_PARAPHRASE_JACCARD) {
          violations.push(`${label}: near-paraphrase of ${it.id} in ${field} (Jaccard ${jac.toFixed(2)} >= ${NEAR_PARAPHRASE_JACCARD}): "${String(it.q).slice(0, 60)}"`);
        }
      }
    }
    // 3. template parity: identical section set, no examples, word budget
    const keys = Object.keys(desc).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...doc.template].sort())) {
      violations.push(`${label}: section set ${JSON.stringify(keys)} != template ${JSON.stringify(doc.template)}`);
    }
    const words = full.split(/\s+/).filter(Boolean).length;
    if (words > doc.byte_budget_words) violations.push(`${label}: ${words} words exceeds budget ${doc.byte_budget_words}`);

    // 4. RUBRIC (Hermes 2026-07-28, mechanized after three auditors gave three orderings on
    // near-identical text — holistic parity judgement is noisy at the effect scale we are
    // controlling). Every description must hit every rubric item ITS OWN CONTRACT SUPPORTS.
    // Structural BIGRAMS (juno F4-6/7): bare nouns like 'section' and 'excerpt' match prose
    // ('a section of the report'); require a data-domain construction instead.
    const STRUCTURES = ['json array', 'ranked list', 'text list', 'list of', 'array of', 'file paths', 'matching lines', 'header', 'one section per'];
    if (typeof desc.outputs === 'string' && !STRUCTURES.some((s) => desc.outputs.toLowerCase().includes(s))) {
      violations.push(`${label}: rubric — outputs must name a data STRUCTURE (${STRUCTURES.join(' / ')}), not prose`);
    }
    // Optional-input default: scoped to the INPUTS field. Requires either 'default' FOLLOWED BY
    // A VALUE (default 5), or 'if omitted' followed by a behaviour clause within 40 chars
    // (juno F-LIVE-2: a bare 'if omitted' trigger phrase passed without any behaviour).
    // Optional-input default: scoped to the INPUTS field. 'default' must be followed by a value
    // containing at least one letter or digit — punctuation alone (default. / default ???) is
    // not a value (juno A1-A4). 'if omitted' must be followed by a verb AND a consequence
    // token — a bare verb (if omitted runs) is not a behaviour clause (juno B1-B2).
    const hasDefaultValue = /\bdefault\b\s*[:\-=]?\s*\S*[a-z0-9]\S*/i.test(desc.inputs || '');
    const hasOmissionBehaviour = /if omitted[\s\S]{0,80}(runs|prints|returns|uses|falls back|errors|exits|prompts|searches|scans|loads|emits|fires|rejects)[\s\S]{2,80}(empty|no list|no matches|status|message|advisory|silence|exit|ok|error|timeout|default|\d)/i.test(desc.inputs || '');
    if (/optional/i.test(desc.inputs || '') && !hasDefaultValue && !hasOmissionBehaviour) {
      violations.push(`${label}: rubric — optional inputs present but no default value or omission behaviour stated in inputs`);
    }
    // Failure behaviour must name BOTH the status channel AND an observable (juno F4-1: a bare
    // 'status ERROR' token passed both guards without stating any behaviour).
    const hasChannel = /status (ok|error|timeout)|usage error/i.test(desc.failure_behaviour || '');
    const hasObservable = /empty|no list|no matches|no-match|zero|message|advisory|silence|exit/i.test(desc.failure_behaviour || '');
    if (!hasChannel || !hasObservable) {
      violations.push(`${label}: rubric — failure behaviour must name the status channel AND an observable (empty output / message text / silence / exit outcome), got: "${desc.failure_behaviour.slice(0, 60)}"`);
    }
  }

  // 5. IDENTITY FINGERPRINT (Hermes 2026-07-28, mechanized): distinctive n-grams (n=3..5) from
  // each description, grepped against the repo. An n-gram that occurs in the tool's OWN source
  // or docs AND nowhere else identifies the tool — FAIL with the exact phrase. Generic tool
  // vocabulary is excluded so honest functional descriptions do not false-fire.
  const GENERIC = new Set(('full text search ranked ranking file files path paths query question string integer optional required matches matching list results documents entry entries described declared function repository repo relative most relevant first best match header reporting corpus excerpt short with when nothing prints returns exit code usage error operation contents names pattern scope where look literal regex case insensitive maximum shown kept per need want accomplish mechanism mechanisms registered registry graph code structure merges their into answer sections each which produced confidence value scoring above term overlap listed message naming then advisory suggesting new may built runs over document bm25 frequency numeric scores printed reading size array json weighting rare terms common ones zero threshold no report grouped source').split(' '));
  // 'local' and 'index' REMOVED from GENERIC (juno F5-1): they broke the mandated control phrase
  // 'fused local index' into a single token, making it invisible to the n-gram extractor. tool_a
  // does not contain either word, so the removal costs no false-positive protection.
  const bindings = doc.binding_harness_side_only || {};
  // Backend map is EXPLICIT, not regex-extracted (advisory 2026-07-28): tool_d's binding is the
  // `ai` wrapper whose search subcommand calls yuri-search.mjs; tool_e's backend is the external
  // rg binary with no repo source — fingerprint is N/A there and the map says so honestly.
  // `backendMap` overrides for --test's synthetic corpus.
  const bindingFiles = backendMap || {
    tool_a: '_SYSTEM/Scripts/atlas/atlas-resolve.mjs',
    tool_b: '_SYSTEM/Scripts/xref-query.mjs',
    tool_c: '_SYSTEM/Scripts/capability-recall.mjs',
    tool_d: '_SYSTEM/Scripts/yuri-search.mjs',
    tool_e: null, // external rg binary; no repo source to fingerprint against
  };
  // Canonical path normalization (advisory + juno path audit, defense-in-depth): backslashes,
  // leading './', trailing dots/whitespace, absolute paths inside the repo root, case. rg's
  // observed output is './'-prefixed or repo-relative; the rest is future-proofing for wrappers.
  const realRootLower = repoRoot.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
  const canon = (f) => {
    let s = String(f).trim().replace(/\\/g, '/').replace(/\.+$/, '');
    if (s.startsWith('./')) s = s.slice(2);
    const lower = s.toLowerCase();
    if (lower.startsWith(realRootLower + '/')) s = s.slice(realRootLower.length + 1);
    return s.replace(/^\/+/, '').toLowerCase();
  };
  // SELF-IMMUNITY (juno F-LIVE-1): this checker's own file contains control phrases in its
  // comments, which would otherwise count as "other files" and suppress violations. It is never
  // evidence about a description's identity either way.
  const SELF_CANON = canon('_SYSTEM/Scripts/atlas/ablation-descriptions-check.mjs');
  const isAllowlisted = (f) => f === SELF_CANON || f === canon('ablation-descriptions.json') || f.endsWith('/ablation-descriptions.json');
  const { execFileSync } = await import('node:child_process');
  for (const [label, desc] of Object.entries(doc.descriptions || {})) {
    const ownFile = bindingFiles[label];
    if (ownFile === undefined) { violations.push(`${label}: no backend mapping — fingerprint cannot fail closed`); continue; }
    if (ownFile === null) continue; // documented N/A (external binary)
    const ownCanon = canon(ownFile);
    const full = [desc.purpose, desc.inputs, desc.outputs, desc.failure_behaviour].join(' ').toLowerCase();
    const tokens = full.match(/[a-z][a-z-]{2,}/g) || [];
    const content = tokens.filter((t) => !GENERIC.has(t));
    const seen = new Set();
    for (let n = 3; n <= 5; n++) {
      for (let i = 0; i + n <= content.length; i++) {
        const gram = content.slice(i, i + n).join(' ');
        if (seen.has(gram)) continue;
        seen.add(gram);
        let hits = '';
        // FAIL CLOSED on rg errors (advisory 2026-07-28): rg exit 1 = no matches (normal); a
        // spawn failure, exit 2, or timeout means the check CANNOT RUN — that is a violation,
        // never a silent zero-hit that disables every fingerprint.
        try {
          if (rgRunner) {
            hits = rgRunner(gram, repoRoot);
          } else {
            hits = execFileSync('rg', ['-l', '--fixed-strings', '--', gram, '.'], { cwd: repoRoot, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
          }
        } catch (err) {
          const status = err && typeof err.status === 'number' ? err.status : null;
          if (status === 1) { hits = ''; } // no matches — normal
          else {
            violations.push(`${label}: fingerprint could not run for "${gram}" (rg ${status !== null ? `exit ${status}` : (err.code || err.message)}); fail closed, not a zero-hit`);
            hits = '';
          }
        }
        if (!hits.trim()) continue;
        const files = hits.trim().split('\n').map(canon);
        // SELF-IMMUNITY, correct direction (advisory 2026-07-28): the checker's own file and the
        // descriptions JSON are REMOVED from the evidence set, not allowlisted into it. A gram
        // found ONLY in the checker is no evidence at all — and a violation requires at least
        // one remaining hit, all of them the tool's own source.
        const evidence = files.filter((f) => !isAllowlisted(f));
        if (evidence.length > 0 && evidence.every((f) => f === ownCanon)) {
          violations.push(`${label}: IDENTITY FINGERPRINT — phrase "${gram}" appears only in the tool's own source (${ownFile}); it identifies the arm`);
        }
      }
    }
  }
  return { violations, checked: Object.keys(doc.descriptions || {}).length };
}

export async function main() {
  if (process.argv.includes('--test')) return runSelfTest();
  const { violations, checked } = await checkDescriptions();
  if (violations.length > 0) {
    console.error(`ablation-descriptions-check: FAIL (${violations.length} violations across ${checked} descriptions)`);
    for (const v of violations) console.error(`  ${v}`);
    return 1;
  }
  console.log(`ablation-descriptions-check: PASS (${checked} descriptions, no expect path/basename, no near-paraphrase >= ${NEAR_PARAPHRASE_JACCARD}, template parity)`);
  return 0;
}

// ---------------------------------------------------------------------------
// Self-test — negative fixtures against a SYNTHETIC mini-corpus (advisory 2026-07-28: fixtures
// must exercise the synthetic surface, not production files). Every check family gets at least
// one fixture that MUST fail and one that MUST pass; unmasked exit codes.
// ---------------------------------------------------------------------------
async function runSelfTest() {
  const { mkdtempSync, writeFileSync, rmSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(path.join(tmpdir(), 'desc-check-'));
  let pass = true;
  const check = (name, cond, detail) => {
    console.log(`[descriptions-check --test] ${name}: ${cond ? 'PASS' : 'FAIL'}${cond ? '' : ` ${detail || ''}`}`.slice(0, 220));
    if (!cond) pass = false;
  };

  // Synthetic corpus under dir/repo (the rg scan surface) — fixture files live OUTSIDE it, or
  // the fixture's own echoed phrases contaminate onlyOwn (advisory: the positive control would
  // be suppressed by its own test input). Base doc is inline and deterministic, never cloned
  // from production; fixture filenames are a counter, not random.
  const repoDir = path.join(dir, 'repo');
  mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  writeFileSync(path.join(repoDir, 'src', 'tool_b.mjs'), [
    '// SYNTHETIC identity phrases for the control fixtures. NOTE (juno F-LIVE-1): the',
    '// brief-quoted phrase "fused local index" never actually appeared in the real xref-query.mjs —',
    '// it came from wayfinding prose and was repeated uncritically. These phrases are deliberately',
    '// synthetic; the LIVE gate scans every description n-gram and needs no mandated phrase.',
    '// searches the fused local index for fast lookup',
    '// auto-surfaces capability hits',
    '',
  ].join('\n'));
  writeFileSync(path.join(repoDir, 'capabilities.json'), '{"note":"auto-surfaces capability hits — registry mirror"}');
  const miniBench = path.join(dir, 'bench.jsonl');
  writeFileSync(miniBench, JSON.stringify({ id: 'q001', q: 'what routes the lane', expect: ['_SYSTEM/Scripts/xref-query.mjs'] }) + '\n');
  const backendMap = { tool_a: null, tool_b: 'src/tool_b.mjs', tool_c: null, tool_d: null, tool_e: null };
  const baseDoc = () => ({
    template: ['purpose', 'inputs', 'outputs', 'failure_behaviour'],
    byte_budget_words: 70,
    descriptions: {
      tool_a: { purpose: 'Ranks repository files by relevance to a natural-language question, weighting rare terms over common ones.', inputs: 'question (string, required); top (integer, optional, default 5 — maximum results).', outputs: 'JSON array of repo-relative file paths, most relevant first. Paths only; no scores.', failure_behaviour: 'Status OK with an empty array when no file scores above zero.' },
      tool_b: { purpose: 'Searches several local indexes at once into one ranked list.', inputs: 'query (string, required); top (integer, optional, default 5 — maximum hits shown).', outputs: 'A header with each index hit count, then one ranked list of file paths.', failure_behaviour: 'No matches: status OK, only the header prints, counts zero; no list.' },
      tool_c: { purpose: 'Finds registered mechanisms whose declared function matches a described need.', inputs: 'need (string, required).', outputs: 'A ranked list of at most 3 entries, best first.', failure_behaviour: 'Below threshold: status OK, a no-match message naming the need.' },
      tool_d: { purpose: 'Runs ranked full-text search over a local document corpus.', inputs: 'query (string, required).', outputs: 'A ranked list of matching documents, best first.', failure_behaviour: 'No matches: status OK, the header reads no matches; no list.' },
      tool_e: { purpose: 'Finds files by literal text content or by file-name pattern.', inputs: 'operation (string, required — contents or names); pattern (string, required).', outputs: 'Matching file paths.', failure_behaviour: 'No matches: status OK with empty output. Unknown operation: status ERROR with a usage message.' },
    },
    binding_harness_side_only: {},
  });
  let fixtureN = 0;
  const fixture = (mutate) => {
    const doc = baseDoc();
    mutate(doc);
    const p = path.join(dir, `f${fixtureN++}.json`);
    writeFileSync(p, JSON.stringify(doc));
    return p;
  };
  const runOn = (p) => checkDescriptions({ descriptionsPath: p, benchmarkPath: miniBench, repoRoot: repoDir, backendMap });

  const clean = await runOn(fixture(() => {}));
  check('clean fixture PASSes', clean.violations.length === 0, JSON.stringify(clean.violations.slice(0, 3)));

  const noStruct = await runOn(fixture((d) => { d.descriptions.tool_a.outputs = 'writes a section of the report to disk'; }));
  check('prose noun is not a structure (juno F4-6)', noStruct.violations.some((v) => v.includes('data STRUCTURE')), JSON.stringify(noStruct.violations));

  const noDefault = await runOn(fixture((d) => { d.descriptions.tool_b.inputs = 'query (string, optional).'; }));
  check('omitted default in inputs FAILS', noDefault.violations.some((v) => v.includes('no default value or omission behaviour')), JSON.stringify(noDefault.violations));

  const defaultInPurpose = await runOn(fixture((d) => { d.descriptions.tool_b.purpose = 'Default operation for everyone.'; d.descriptions.tool_b.inputs = 'query (string, optional).'; }));
  check('default in PURPOSE does not satisfy the optional guard (juno F4-1)', defaultInPurpose.violations.some((v) => v.includes('no default value or omission behaviour')), JSON.stringify(defaultInPurpose.violations));

  const bareOmitted = await runOn(fixture((d) => { d.descriptions.tool_b.inputs = 'query (string, optional; if omitted).'; }));
  check('bare if-omitted trigger without behaviour FAILS (juno F-LIVE-2)', bareOmitted.violations.some((v) => v.includes('no default value or omission behaviour')), JSON.stringify(bareOmitted.violations));

  const punctDefault = await runOn(fixture((d) => { d.descriptions.tool_b.inputs = 'query (string, optional; default ???).'; }));
  check('punctuation is not a default value (juno A1-A4)', punctDefault.violations.some((v) => v.includes('no default value or omission behaviour')), JSON.stringify(punctDefault.violations));

  const bareVerb = await runOn(fixture((d) => { d.descriptions.tool_b.inputs = 'query (string, optional; if omitted returns).'; }));
  check('bare verb is not an omission behaviour (juno B1-B2)', bareVerb.violations.some((v) => v.includes('no default value or omission behaviour')), JSON.stringify(bareVerb.violations));

  const bareStatus = await runOn(fixture((d) => { d.descriptions.tool_a.failure_behaviour = 'status ERROR.'; }));
  check('bare status token without observable FAILS (juno F4-1)', bareStatus.violations.some((v) => v.includes('status channel AND an observable')), JSON.stringify(bareStatus.violations));

  const control = await runOn(fixture((d) => { d.descriptions.tool_b.purpose = 'Searches the fused local index for grounded answers.'; }));
  check('mandated control phrase fused local index FIRES (juno F5-1 fix)', control.violations.some((v) => v.includes('IDENTITY FINGERPRINT')), JSON.stringify(control.violations.slice(0, 2)));

  const mirror = await runOn(fixture((d) => { d.descriptions.tool_b.purpose = 'A surface that auto-surfaces capability hits for everyone.'; }));
  check('multi-file registry mirror is correctly NON-unique (juno retraction honored)', !mirror.violations.some((v) => v.includes('auto-surfaces')), JSON.stringify(mirror.violations.slice(0, 3)));

  const empty = await runOn(fixture((d) => { d.descriptions = {}; }));
  check('empty descriptions FAIL CLOSED', empty.violations.length > 0, 'returned no violations');

  const nullDesc = await runOn(fixture((d) => { d.descriptions = null; }));
  check('non-object descriptions FAILS with shape violation', nullDesc.violations.some((v) => v.includes('descriptions object missing') || v.includes('required label')), JSON.stringify(nullDesc.violations.slice(0, 2)));

  // rg error path: a failing rg must produce a violation, never a silent zero-hit (advisory).
  const rgDown = await checkDescriptions({
    descriptionsPath: fixture((d) => { d.descriptions.tool_b.purpose = 'Searches the fused local index for grounded answers.'; }),
    benchmarkPath: miniBench, repoRoot: repoDir, backendMap,
    rgRunner: () => { const e = new Error('spawn rg ENOENT'); e.code = 'ENOENT'; throw e; },
  });
  check('rg spawn failure fails closed (no silent zero-hit)', rgDown.violations.some((v) => v.includes('fingerprint could not run')), JSON.stringify(rgDown.violations.slice(0, 2)));

  // Checker-only hit: a phrase that appears ONLY in the checker's own comments is NO evidence
  // (advisory: allowlisting self into the evidence set inverted the immunity and could fabricate
  // fingerprints). Uses a real phrase from this file's own comments via a synthetic own-file miss.
  const selfOnly = await checkDescriptions({
    descriptionsPath: fixture((d) => { d.descriptions.tool_b.purpose = 'A deliberate synthetic identity phrase for fixtures only.'; }),
    benchmarkPath: miniBench, repoRoot: repoDir, backendMap,
    rgRunner: () => '_SYSTEM/Scripts/atlas/ablation-descriptions-check.mjs\n',
  });
  check('checker-only hit is NOT evidence (no fabricated fingerprint)', !selfOnly.violations.some((v) => v.includes('IDENTITY FINGERPRINT')), JSON.stringify(selfOnly.violations.slice(0, 2)));

  // Self + own-source hit: the violation still fires on the own-file evidence.
  const selfPlusOwn = await checkDescriptions({
    descriptionsPath: fixture((d) => { d.descriptions.tool_b.purpose = 'A deliberate synthetic identity phrase for fixtures only.'; }),
    benchmarkPath: miniBench, repoRoot: repoDir, backendMap,
    rgRunner: () => '_SYSTEM/Scripts/atlas/ablation-descriptions-check.mjs\nsrc/tool_b.mjs\n',
  });
  check('own-source evidence still fires past self-immunity', selfPlusOwn.violations.some((v) => v.includes('IDENTITY FINGERPRINT')), JSON.stringify(selfPlusOwn.violations.slice(0, 2)));

  // Juno coverage gap (2026-07-28): families 1-3 and the shape checks had NO negative fixtures.
  // The mini benchmark's expect is _SYSTEM/Scripts/xref-query.mjs — a description containing it
  // (or its basename) must fail family 1; a near-paraphrase of q001 must fail family 2.
  const expectLit = await runOn(fixture((d) => { d.descriptions.tool_a.outputs = 'JSON array; see _SYSTEM/Scripts/xref-query.mjs for shape.'; }));
  check('family 1: literal expect path in description FAILS', expectLit.violations.some((v) => v.includes('expect path')), JSON.stringify(expectLit.violations.slice(0, 2)));

  const expectBase = await runOn(fixture((d) => { d.descriptions.tool_a.outputs = 'JSON array shaped like xref-query.mjs output.'; }));
  check('family 1: expect basename in description FAILS', expectBase.violations.some((v) => v.includes('expect basename')), JSON.stringify(expectBase.violations.slice(0, 2)));

  const paraphrase = await runOn(fixture((d) => { d.descriptions.tool_a.purpose = 'what routes the lane'; }));
  check('family 2: near-paraphrase of a benchmark question FAILS', paraphrase.violations.some((v) => v.includes('near-paraphrase')), JSON.stringify(paraphrase.violations.slice(0, 2)));

  // Shuffled rephrase in the 0.5-0.7 band (juno round 4: the identical-text fixture passes at
  // any threshold up to 1.0 — this one proves the threshold itself bites).
  const shuffled = await runOn(fixture((d) => { d.descriptions.tool_a.purpose = 'which lane routes what'; }));
  check('family 2: token-shuffled rephrase above threshold FAILS', shuffled.violations.some((v) => v.includes('near-paraphrase')), JSON.stringify(shuffled.violations.slice(0, 2)));

  const missingSection = await runOn(fixture((d) => { delete d.descriptions.tool_a.outputs; }));
  check('family 3: missing template section FAILS', missingSection.violations.some((v) => v.includes('section set')), JSON.stringify(missingSection.violations.slice(0, 2)));

  const overBudget = await runOn(fixture((d) => { d.descriptions.tool_a.purpose = 'word '.repeat(80).trim(); }));
  check('family 3: over word budget FAILS', overBudget.violations.some((v) => v.includes('exceeds budget')), JSON.stringify(overBudget.violations.slice(0, 2)));

  const missingLabel = await runOn(fixture((d) => { delete d.descriptions.tool_e; }));
  check('shape: missing required label FAILS', missingLabel.violations.some((v) => v.includes('required label')), JSON.stringify(missingLabel.violations.slice(0, 2)));

  const extraLabel = await runOn(fixture((d) => { d.descriptions.tool_x = { purpose: 'x', inputs: 'x', outputs: 'x', failure_behaviour: 'x' }; }));
  check('shape: unexpected label FAILS', extraLabel.violations.some((v) => v.includes('unexpected label')), JSON.stringify(extraLabel.violations.slice(0, 2)));

  const emptyBench = path.join(dir, 'empty-bench.jsonl');
  writeFileSync(emptyBench, '');
  const noBench = await checkDescriptions({ descriptionsPath: fixture(() => {}), benchmarkPath: emptyBench, repoRoot: repoDir, backendMap });
  check('shape: empty benchmark FAILS CLOSED', noBench.violations.some((v) => v.includes('benchmark is empty') || v.includes('nothing to check')), JSON.stringify(noBench.violations.slice(0, 2)));

  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  console.log(`[descriptions-check --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main().then((c) => { process.exitCode = c; });
