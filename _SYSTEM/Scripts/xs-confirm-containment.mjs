#!/usr/bin/env node
/**
 * xs-confirm-containment.mjs — the CROSS-SURFACE confirm-or-kill (the architect's energy-L∞ triangle).
 * Tests whether CONTAINMENT (|F(q)∩F(d)|/|F(q)|) lets a short cue reach long cross-surface targets where
 * symmetric Jaccard's length-band ceiling (max ~|q|/|d|) excludes them — AND whether decoys stay below the
 * targets (the specificity-collapse guard). Non-circular: real on-disk artifacts, fixed ground truth.
 * Read-only. Also reports IDF-weighted containment (the architect's mitigation for generic-term flooding).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFeatureFn } from './math/yuri-token-expand.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const MEM = path.join(os.homedir(), '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

const CUE = 'L-infinity max-severity veto offsettable equal-magnitude swap severity laundering';

// the cross-surface triangle: known-correct targets (code+memory+doc) + decoys, all real on disk
const ITEMS = [
  { id: 'CODE:yuri-energy.mjs', surface: 'code', target: true, text: read(path.join(REPO, '_SYSTEM/Scripts/math/yuri-energy.mjs')) },
  { id: 'MEM:energy-L∞-doubly-inert', surface: 'memory', target: true, text: read(path.join(MEM, 'energy-gate-Linfinity-doubly-inert.md')) },
  { id: 'MEM:delta-gate-severity-laundering', surface: 'memory', target: true, text: read(path.join(MEM, 'delta-gate-severity-laundering.md')) },
  { id: 'DOC:GVF-governance', surface: 'docs', target: true, text: read(path.join(REPO, '02_RESOURCES/RESEARCH/yuri-governance-architecture-GVF-2026-06-06.md')) },
  { id: 'DECOY-MEM:layout-ma', surface: 'memory', target: false, text: read(path.join(MEM, 'feedback-layout-ma-not-slidedeck.md')) },
  { id: 'DECOY-CODE:token-ledger', surface: 'code', target: false, text: read(path.join(REPO, '_SYSTEM/Scripts/token-ledger.mjs')) },
].filter((x) => x.text && x.text.length > 20);

// one SHARED feature space over cue+all items (Layer A) so features are commensurable
const corpus = [{ id: 'cue', text: CUE }, ...ITEMS.map((i) => ({ id: i.id, text: i.text }))];
const { featureFn } = makeFeatureFn(corpus, { minCooc: 2, ppmiFloor: 1.0, topN: 4 });
const fset = (t) => new Set(featureFn(t));
const inter = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n; };

// global IDF over the corpus (rarer feature = higher weight) for IDF-weighted containment
const df = new Map();
const allSets = corpus.map((c) => fset(c.text));
for (const s of allSets) for (const f of s) df.set(f, (df.get(f) || 0) + 1);
const N = corpus.length;
const idf = (f) => Math.log((N + 1) / ((df.get(f) || 0) + 0.5));

const Fq = fset(CUE);
const idfInter = (Fd) => { let w = 0, tot = 0; for (const f of Fq) { tot += idf(f); if (Fd.has(f)) w += idf(f); } return tot > 0 ? w / tot : 0; };

const rows = ITEMS.map((it) => {
  const Fd = fset(it.text);
  const i = inter(Fq, Fd);
  const jaccard = i / (Fq.size + Fd.size - i || 1);
  const containment = i / (Fq.size || 1);           // Layer B — cue-anchored, size-immune
  const idfContainment = idfInter(Fd);              // specificity-collapse mitigation
  const jaccardCeiling = Fq.size / Fd.size;         // the max Jaccard could ever be (the band ceiling)
  return { ...it, lenF: Fd.size, jaccard: +jaccard.toFixed(4), jaccardCeiling: +jaccardCeiling.toFixed(4), containment: +containment.toFixed(4), idfContainment: +idfContainment.toFixed(4) };
});

const rankBy = (key) => [...rows].sort((a, b) => b[key] - a[key]);
const verdict = (key) => {
  const r = rankBy(key);
  const worstTargetRank = Math.max(...r.map((x, idx) => (x.target ? idx : -1)));
  const bestDecoyRank = Math.min(...r.map((x, idx) => (!x.target ? idx : 99)));
  return { ranked: r.map((x) => `${x.target ? 'T' : 'D'}:${x.id}=${x[key]}`), pass: worstTargetRank < bestDecoyRank };
};

console.log('cue:', CUE, '| query features:', Fq.size, '| items:', ITEMS.length);
console.log('\n— per-item (sorted by containment) —');
for (const r of rankBy('containment')) console.log(`  ${r.target ? 'TARGET' : 'DECOY '} ${r.id.padEnd(34)} |F|=${String(r.lenF).padStart(4)}  jaccard=${r.jaccard} (ceil ${r.jaccardCeiling})  containment=${r.containment}  idfCont=${r.idfContainment}`);

const vJ = verdict('jaccard'), vC = verdict('containment'), vI = verdict('idfContainment');
console.log('\n— VERDICTS (targets must all outrank every decoy) —');
console.log('  Jaccard         pass=' + vJ.pass + '  (the broken baseline — band excludes long targets)');
console.log('  containment     pass=' + vC.pass);
console.log('  idf-containment pass=' + vI.pass + '  (specificity-guarded)');
const overall = vC.pass || vI.pass;
console.log('\nRESULT:', overall ? 'CONFIRMED — containment surfaces the cross-surface triangle; decoys stay below'
  : 'KILLED — containment did not cleanly separate targets from decoys; needs IDF gate or global-space refit');
const out = { cue: CUE, items: rows, verdicts: { jaccard: vJ.pass, containment: vC.pass, idfContainment: vI.pass }, overall };
fs.writeFileSync(path.join(REPO, '02_RESOURCES/RESEARCH/xs-confirm-containment-report.json'), JSON.stringify(out, null, 2));
