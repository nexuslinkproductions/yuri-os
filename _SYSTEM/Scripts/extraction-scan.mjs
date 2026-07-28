#!/usr/bin/env node
// @capability: extraction-scan
// @serves: can I lift this mechanism out | extraction manifest | is this coupled to YURI | what do I need to release this as a repo | tier verification
// @does: verifies @tier/@couples/@deps claims against real imports and computes the extraction manifest for any capability
// @use: before releasing a mechanism standalone, and in CI so a `generic` tag cannot silently become false
// @exports: checkGraph, parseTags, buildGraph, manifestFor, main
// @tier: seam
// @couples: filesystem scanner — buildGraph(root) supplies {file -> {tags, localImports}}; checkGraph is pure and portable
// @deps: none
//
// extraction-scan.mjs — makes extractability a CHECKED property instead of an asserted one.
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------------------------
// YURI now carries @tier/@couples/@deps alongside @capability so that mechanisms can be lifted out
// and released individually. Between 2026-07-26 and 2026-07-28 this repo shipped FIVE artifacts
// that existed, read correctly, and enforced nothing: deny rules in the wrong form, a git hook at
// mode 644, adapters named in doctrine but absent on disk, a credential block behind an early
// allow(), and a persona hook referenced by no settings key. A `@tier: generic` tag that nothing
// verifies would be the sixth. So the tag is a CLAIM and this file is what refutes it.
//
// THE ONE RULE THAT DOES THE WORK
// ---------------------------------------------------------------------------------------------
//   A `generic` file may import only other `generic` files (plus external @deps).
// That is transitively checkable with no heuristics and no path allowlists. If a file claims to be
// liftable but reaches into something that is not, the claim is false and this exits non-zero.
// Corollary worth stating: genericness is a property of a SUBGRAPH, never of a single file.
//
// TIERS
//   generic    — imports nothing repo-local that is not itself generic. Test: copy into an empty
//                repo, install @deps, run its self-test. If you cannot answer that, it is not generic.
//   seam       — has repo couplings, each replaceable through a NAMED interface. @couples must name
//                the INTERFACE, not the file. "imports atlas-resolve" is a binding;
//                "resolver interface: resolve(question, top) -> {paths, hops}" is a seam. The named
//                interface IS the extraction instruction.
//   yuri-bound — encodes YURI ontology/corpus/policy. Extraction means rewriting. Tag it honestly;
//                a truthful yuri-bound is worth more than an aspirational seam.
//
// USAGE
//   node _SYSTEM/Scripts/extraction-scan.mjs                 # verify all tagged files
//   node _SYSTEM/Scripts/extraction-scan.mjs --manifest=<capability>
//   node _SYSTEM/Scripts/extraction-scan.mjs --report        # tier health, no failure
//   node _SYSTEM/Scripts/extraction-scan.mjs --self-test

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TIERS = ['generic', 'seam', 'yuri-bound'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.gitnexus', 'dist', 'build', 'coverage']);

// ---------------------------------------------------------------------------------------------
// PURE CORE — no filesystem. This half is portable; buildGraph() below is the seam.
// ---------------------------------------------------------------------------------------------

export function parseTags(source) {
  const tag = (name) => {
    const m = source.match(new RegExp(`^//\\s*@${name}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  return {
    capability: tag('capability'),
    tier: tag('tier'),
    couples: tag('couples'),
    deps: tag('deps'),
  };
}

/** Repo-local import specifiers only — bare specifiers are external and belong in @deps. */
export function localImports(source) {
  const out = new Set();
  const patterns = [
    /(?:^|\n)\s*import\s[^'"`]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) {
      if (m[1].startsWith('.') || m[1].startsWith('/')) out.add(m[1]);
    }
  }
  return [...out];
}

// A @couples value must NAME AN INTERFACE, not a file. This is deliberately crude: it catches the
// failure mode that matters (restating the import) without pretending to judge prose quality.
function couplesNamesAnInterface(value) {
  if (!value || value === 'none') return false;
  if (value.length < 20) return false;
  return value.includes('->') || value.includes(':') || value.includes('(');
}

/**
 * graph: { [repoRelPath]: { tags, imports: repoRelPath[] } }
 * Returns { errors[], warnings[], counts }. Pure — same input, same output.
 */
export function checkGraph(graph) {
  const errors = [];
  const warnings = [];
  const counts = { generic: 0, seam: 0, 'yuri-bound': 0, untagged: 0 };

  for (const [file, node] of Object.entries(graph)) {
    const { tier, couples, capability } = node.tags;

    if (!tier) {
      counts.untagged++;
      if (capability) warnings.push(`${file}: has @capability but no @tier — untagged mechanisms cannot be extracted or released`);
      continue;
    }
    if (!TIERS.includes(tier)) {
      errors.push(`${file}: @tier "${tier}" is not one of ${TIERS.join(' | ')}`);
      continue;
    }
    counts[tier]++;

    // THE LOAD-BEARING CHECK. A generic file may only reach other generic files.
    if (tier === 'generic') {
      for (const dep of node.imports) {
        const depNode = graph[dep];
        if (!depNode) {
          errors.push(`${file}: tagged generic but imports untracked repo file ${dep} — cannot verify the claim`);
        } else if (depNode.tags.tier !== 'generic') {
          errors.push(
            `${file}: tagged GENERIC but imports ${dep} which is ${depNode.tags.tier || 'UNTAGGED'}.`
            + ` Genericness is a property of the whole subgraph — either retag this as seam, or lift the dependency.`,
          );
        }
      }
      if (couples && couples !== 'none') {
        errors.push(`${file}: tagged generic but declares @couples "${couples}" — a generic file couples to nothing`);
      }
    }

    if (tier === 'seam' && !couplesNamesAnInterface(couples)) {
      errors.push(
        `${file}: tagged seam but @couples does not NAME AN INTERFACE ("${couples ?? 'missing'}").`
        + ` "imports X" is a binding; "resolver interface: resolve(q, top) -> {paths, hops}" is a seam.`
        + ` The named interface is the extraction instruction.`,
      );
    }
  }

  return { errors, warnings, counts };
}

/** Transitive repo-local closure — what you would have to carry to lift this file out. */
export function manifestFor(graph, startFile) {
  const seen = new Set();
  const stack = [startFile];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of graph[f]?.imports ?? []) if (!seen.has(d)) stack.push(d);
  }
  const files = [...seen].sort();
  const external = new Set();
  for (const f of files) {
    const d = graph[f]?.tags.deps;
    if (d && d !== 'none') d.split(/[·|,]/).forEach((x) => { const t = x.trim(); if (t) external.add(t); });
  }
  return {
    root: startFile,
    files,
    byTier: files.reduce((a, f) => { const t = graph[f]?.tags.tier ?? 'untagged'; a[t] = (a[t] || 0) + 1; return a; }, {}),
    externalDeps: [...external].sort(),
    liftable: files.every((f) => graph[f]?.tags.tier === 'generic'),
  };
}

// ---------------------------------------------------------------------------------------------
// SEAM — filesystem adapter
// ---------------------------------------------------------------------------------------------

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    let st; try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(mjs|js|cjs)$/.test(entry)) acc.push(full);
  }
  return acc;
}

export function buildGraph(root = REPO_ROOT) {
  const graph = {};
  const files = walk(path.join(root, '_SYSTEM'));
  for (const abs of files) {
    let src; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    const tags = parseTags(src);
    if (!tags.capability && !tags.tier) continue; // only tagged mechanisms participate
    const rel = path.relative(root, abs);
    const imports = localImports(src)
      .map((spec) => path.relative(root, path.resolve(path.dirname(abs), spec)))
      .filter((p) => !p.startsWith('..'));
    graph[rel] = { tags, imports };
  }
  return graph;
}

// ---------------------------------------------------------------------------------------------

function selfTest() {
  let pass = 0, fail = 0;
  const check = (n, ok) => { if (ok) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.error(`  FAIL ${n}`); } };

  const t = (tier, couples = null, deps = 'none') => ({ capability: 'x', tier, couples, deps });

  // NEGATIVE PROBE — the whole point. A generic file reaching a yuri-bound file must be REJECTED.
  const bad = {
    'a.mjs': { tags: t('generic'), imports: ['b.mjs'] },
    'b.mjs': { tags: t('yuri-bound'), imports: [] },
  };
  const r1 = checkGraph(bad);
  check('REJECTS generic importing yuri-bound (the load-bearing rule)',
    r1.errors.length === 1 && /tagged GENERIC but imports/.test(r1.errors[0]));

  // Transitivity: generic -> generic -> yuri-bound must still fail at the middle link.
  const chain = {
    'a.mjs': { tags: t('generic'), imports: ['b.mjs'] },
    'b.mjs': { tags: t('generic'), imports: ['c.mjs'] },
    'c.mjs': { tags: t('seam', 'iface: f(x) -> y, replaceable'), imports: [] },
  };
  check('REJECTS transitively (genericness is a subgraph property)', checkGraph(chain).errors.length === 1);

  check('ACCEPTS an all-generic subgraph',
    checkGraph({ 'a.mjs': { tags: t('generic'), imports: ['b.mjs'] }, 'b.mjs': { tags: t('generic'), imports: [] } }).errors.length === 0);

  // A seam whose @couples merely restates the import is the failure this catches.
  check('REJECTS seam whose @couples names a FILE not an interface',
    checkGraph({ 'a.mjs': { tags: t('seam', 'imports atlas-resolve'), imports: [] } }).errors.length === 1);
  check('ACCEPTS seam whose @couples names an interface',
    checkGraph({ 'a.mjs': { tags: t('seam', 'resolver interface: resolve(question, top) -> {paths, hops}'), imports: [] } }).errors.length === 0);
  check('REJECTS generic that declares couples',
    checkGraph({ 'a.mjs': { tags: t('generic', 'something: f() -> g, injected here'), imports: [] } }).errors.length === 1);
  check('REJECTS unknown tier',
    checkGraph({ 'a.mjs': { tags: t('portable'), imports: [] } }).errors.length === 1);

  const man = manifestFor(chain, 'a.mjs');
  check('manifest closes transitively and reports non-liftable',
    man.files.length === 3 && man.liftable === false);
  check('manifest marks an all-generic closure liftable',
    manifestFor({ 'a.mjs': { tags: t('generic'), imports: [] } }, 'a.mjs').liftable === true);

  // Parser must read real tag syntax, not a synthetic shape.
  const parsed = parseTags('// @capability: foo\n// @tier: seam\n// @couples: x interface: f() -> y\n// @deps: none\n');
  check('parses real tag block', parsed.tier === 'seam' && parsed.capability === 'foo');
  check('detects local imports only, not bare specifiers',
    JSON.stringify(localImports("import a from './x.mjs';\nimport b from 'node:fs';\n")) === '["./x.mjs"]');

  console.log(`\nSELF-TEST: ${pass}/${pass + fail} passed`);
  return fail === 0;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--self-test')) return selfTest() ? 0 : 1;

  const graph = buildGraph();
  const manifestArg = argv.find((a) => a.startsWith('--manifest='));
  if (manifestArg) {
    const want = manifestArg.slice('--manifest='.length);
    const entry = Object.entries(graph).find(([f, n]) => n.tags.capability === want || f.endsWith(want));
    if (!entry) { console.error(`extraction-scan: no tagged mechanism matching "${want}"`); return 1; }
    console.log(JSON.stringify(manifestFor(graph, entry[0]), null, 2));
    return 0;
  }

  const { errors, warnings, counts } = checkGraph(graph);
  const total = Object.keys(graph).length;
  const tagged = counts.generic + counts.seam + counts['yuri-bound'];
  const coverage = total ? tagged / total : 0;

  // COVERAGE LEADS, NOT THE VERDICT. This tool verifies CLAIMS; an untagged file makes no claim,
  // so it can never fail. Printing "all tier claims verified" while 99% of the repo is untagged
  // would be green for a reason unrelated to the property anyone cares about — the exact shape of
  // defect this repo has now shipped six times. So the headline is what is COVERED, and the
  // verdict is explicitly scoped to it.
  console.log(`extraction-scan: ${tagged}/${total} mechanisms tagged (${(coverage * 100).toFixed(1)}% coverage)`);
  console.log(`  generic ${counts.generic} | seam ${counts.seam} | yuri-bound ${counts['yuri-bound']} | untagged ${counts.untagged}`);

  if (argv.includes('--report')) {
    for (const w of warnings) console.log(`  note: ${w}`);
    return 0;
  }
  if (errors.length) {
    console.error(`\nextraction-scan: ${errors.length} FALSE TIER CLAIM(S)`);
    for (const e of errors) console.error(`  ${e}`);
    return 1;
  }
  if (coverage < 0.5) {
    console.log(`extraction-scan: the ${tagged} tagged claim(s) hold — but ${counts.untagged} mechanisms make NO claim.`);
    console.log('  This is not a clean bill of health for the repo, only for what has been tagged.');
  } else {
    console.log('extraction-scan: all tier claims verified');
  }
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) process.exit(main());
