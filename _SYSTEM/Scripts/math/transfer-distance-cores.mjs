#!/usr/bin/env node
/**
 * transfer-distance-cores.mjs — candidate STRUCTURAL distance metrics for the V2 bake-off.
 *
 * Each candidate implements the pluggable metric contract from transfer-distance.mjs:
 *   metric(x, y, opts) -> { d, lowQuality }   (d ∈ [0,1], pure, deterministic, embedding-free)
 * and is swapped in as opts.distFn. The bake-off (transfer-distance.bakeoff.mjs) runs each
 * over the 36-card logbook and keeps whatever actually SEPARATES near from far (P1 ≥ 0.05),
 * where the V1 surface-gzip blend failed (register-dominated, margin −0.01).
 *
 * Candidates (provenance):
 *   C2 operatorSkeletonDistance — Claude lane (Kimi's draft derailed). Gentner relations-not-
 *      attributes operationalized: keep a STRUCTURAL lexicon (operators + math primitives),
 *      DROP domain register nouns, distance over the skeletons. [gentner-1983-smt]
 *   C3 grammarNcd — Codex/gpt-5.5 lane. Re-Pair grammar compression + operator normalization;
 *      isomorphic mechanism → isomorphic rules → low d. [nevillmanning-1997-sequitur][larsson-2000-repair]
 *   C1 brotliNcd / C4 cdmDistance — DeepSeek lane (info-distance). [cilibrasi-2004-ncd][keogh-2004-cdm]
 */
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';
import { ncd, jaccardDistance, tokenize, MIN_CHARS, transferScore } from './transfer-distance.mjs';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
function gzipLen(t) { return t ? gzipSync(Buffer.from(t, 'utf8'), { level: 6 }).length : 0; }
function brotliLen(t) {
  if (!t) return 0;
  return brotliCompressSync(Buffer.from(t, 'utf8'), { params: { [zc.BROTLI_PARAM_QUALITY]: 5 } }).length;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// C2 — operatorSkeletonDistance (Claude lane). The primary hypothesis.
// Keep STRUCTURAL tokens (what the mechanism DOES — operators + math primitives), drop the
// domain register (what it's ABOUT — kalman/energy/memory). Distance over the skeleton, so
// "predict→update→gate" reads the same whether dressed in control-theory or salience prose.
// ───────────────────────────────────────────────────────────────────────────────────────────

// Frozen STRUCTURAL lexicon: operators, relations, and cross-domain math primitives. Each entry
// is a stem; light stemming maps surface forms onto it. Deliberately domain-AGNOSTIC — no
// kalman/energy/memory/cortex/lane (those are register). ~110 terms.
const STRUCT_STEMS = new Set([
  // estimation / update / inference
  'estimat','predict','updat','fold','recurs','converg','iterat','infer','posterior','prior',
  'bayes','likelihood','sampl','draw','expect','varianc','covarianc','mean','median','moment',
  // gating / threshold / detection / decision
  'gate','threshold','bound','cap','floor','ceiling','veto','penal','reject','accept','decid',
  'detect','flag','alarm','trigger','signal','surpris','outlier','anomal',
  // accumulation / integration / flow
  'accumul','integr','sum','cumul','aggreg','sweep','scan','propag','cascad','flow','stream',
  // combination / merge / weighting / normalization
  'merg','fuse','combin','blend','weight','scale','normal','calibr','rank','sort','order','rate',
  // decay / aging / survival / time
  'decay','ag','stale','halflife','hazard','surviv','renew','burn','probation','horizon',
  // structure / graph / cluster / topology
  'graph','edg','node','path','cluster','partition','component','connect','bridg','cut','curvatur',
  'spectral','eigen','laplacian','persist','union','filtrat','topolog','isomorph',
  // information / compression / divergence
  'entrop','diverg','information','compress','complex','redundan','describ','encod','bit',
  // optimization / regret / learning / bandit
  'gradient','optim','regret','minim','maxim','learn','reward','explor','exploit','bandit','posteriorsampl',
  // consensus / evidence / proof / scoring
  'consensus','quorum','vote','agree','conflict','evidence','prove','certif','score','bet','wealth',
  'necess','ablat','counterfact','interven','reliab',
]);

function stemTok(t) {
  return String(t)
    .replace(/(ization|isation|izing|ising)$/u, 'iz')
    .replace(/(ational|ation|ategy)$/u, 'at')
    .replace(/(ing|ed|es|s|ly|ity|ies|ion|al|ic|ive)$/u, '')
    .replace(/(e)$/u, '');
}

function structuralSkeleton(text) {
  const toks = tokenize(text);
  const skel = [];
  for (const raw of toks) {
    const s = stemTok(raw);
    // a token is structural if some lexicon stem is a prefix of it (or vice-versa)
    for (const stem of STRUCT_STEMS) {
      if (s.startsWith(stem) || stem.startsWith(s.slice(0, Math.max(4, stem.length)))) { skel.push(stem); break; }
    }
  }
  return skel;
}

export function operatorSkeletonDistance(x, y, opts = {}) {
  const minChars = opts.minChars ?? MIN_CHARS;
  if (String(x || '').trim().length < minChars || String(y || '').trim().length < minChars) {
    return { d: 0.5, lowQuality: true };
  }
  const sx = structuralSkeleton(x);
  const sy = structuralSkeleton(y);
  if (sx.length < 2 || sy.length < 2) return { d: 0.5, lowQuality: true }; // too few structural tokens
  // Jaccard over the skeleton SETS (structure presence) + multiset ncd over the skeleton STRINGS
  // (structure ordering/frequency). Blend: set-overlap dominant, ordering a corroborant.
  const jac = jaccardDistance(sx.join(' '), sy.join(' '));
  const sxStr = sx.join(' ');
  const syStr = sy.join(' ');
  // ncd over skeletons needs length; pad-guard via minChars relaxed (skeletons are short)
  const { ncd: nd } = ncd(sxStr, syStr, { minChars: 12 });
  const d = clamp01(0.7 * jac + 0.3 * nd);
  return { d, lowQuality: false, jaccard: jac, ncd: nd, nx: sx.length, ny: sy.length };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// C1 — brotliNcd (DeepSeek lane). Context-modeling compressor swap (brotli > gzip window).
// ───────────────────────────────────────────────────────────────────────────────────────────
export function brotliNcd(x, y, opts = {}) {
  const minChars = opts.minChars ?? MIN_CHARS;
  const a = String(x || ''); const b = String(y || '');
  if (a.trim().length < minChars || b.trim().length < minChars) return { d: 0.5, lowQuality: true };
  const cx = brotliLen(a), cy = brotliLen(b), cxy = brotliLen(a + '\n' + b);
  const denom = Math.max(cx, cy);
  if (denom <= 0) return { d: 0.5, lowQuality: true };
  return { d: clamp01((cxy - Math.min(cx, cy)) / denom), lowQuality: false };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// C4 — cdmDistance (DeepSeek lane). Keogh CDM: C(xy)/(C(x)+C(y)), ∈ [0.5,1] → rescaled [0,1].
// ───────────────────────────────────────────────────────────────────────────────────────────
export function cdmDistance(x, y, opts = {}) {
  const minChars = opts.minChars ?? MIN_CHARS;
  const a = String(x || ''); const b = String(y || '');
  if (a.trim().length < minChars || b.trim().length < minChars) return { d: 0.5, lowQuality: true };
  const cx = gzipLen(a), cy = gzipLen(b), cxy = gzipLen(a + '\n' + b);
  if (cx + cy <= 0) return { d: 0.5, lowQuality: true };
  const cdm = cxy / (cx + cy); // ∈ ~[0.5 (identical), 1 (unrelated)]
  return { d: clamp01((cdm - 0.5) * 2), lowQuality: false };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// C3 — grammarNcd (Codex/gpt-5.5 lane). Re-Pair grammar compression + operator normalization.
// ───────────────────────────────────────────────────────────────────────────────────────────
const STOP = new Set(['the','and','for','with','that','this','from','into','onto','than','then','when','where','which','while','under','over','each','only','must','will','not','but','are','was','were','been','being','via','its','their','our','your','his','her','one','two','three','same','today','existing','current','new','real','first','second']);
const REL = new Map([
  ['predicts','REL_PREDICT'],['predict','REL_PREDICT'],['updates','REL_UPDATE'],['update','REL_UPDATE'],
  ['folding','REL_MERGE'],['fold','REL_MERGE'],['merge','REL_MERGE'],['fuse','REL_MERGE'],
  ['weighted','REL_WEIGHT'],['weight','REL_WEIGHT'],['scale','REL_SCALE'],['scaled','REL_SCALE'],
  ['gating','REL_GATE'],['gate','REL_GATE'],['threshold','REL_GATE'],['alarm','REL_GATE'],
  ['detect','REL_DETECT'],['detector','REL_DETECT'],['flag','REL_DETECT'],['emit','REL_EMIT'],
  ['remove','REL_REMOVE'],['delete','REL_REMOVE'],['ablation','REL_REMOVE'],
  ['sweep','REL_SWEEP'],['filter','REL_FILTER'],['filtration','REL_FILTER'],
  ['cluster','REL_CLUSTER'],['component','REL_COMPONENT'],['components','REL_COMPONENT'],
  ['graph','REL_GRAPH'],['edge','REL_EDGE'],['edges','REL_EDGE'],['node','REL_NODE'],['nodes','REL_NODE'],
  ['rank','REL_RANK'],['score','REL_SCORE'],['measure','REL_MEASURE'],['test','REL_TEST'],
  ['calibrate','REL_CALIBRATE'],['calibrated','REL_CALIBRATE'],
  ['confidence','REL_CONF'],['variance','REL_VAR'],['hazard','REL_HAZARD'],
  ['probability','REL_PROB'],['evidence','REL_EVID'],['claim','REL_CLAIM'],
  ['memory','REL_MEMORY'],['routing','REL_ROUTE'],['dispatch','REL_ROUTE'],
  ['consensus','REL_CONSENSUS'],['lane','REL_LANE'],['lanes','REL_LANE'],
]);
function gStem(t) { return t.replace(/'(s|re|ve|ll|d)$/u,'').replace(/(ization|isation)$/u,'ize').replace(/(ational)$/u,'ate').replace(/(ingly|edly)$/u,'').replace(/(ing|ed|es|s)$/u,''); }
function grammarTokens(text) {
  const raw = String(text || '').toLowerCase()
    .replace(/`[^`]+`/g,' CODE ').replace(/[α-ωΑ-Ω]+/gu,' GREEK ').replace(/\b\d+(?:\.\d+)?\b/g,' NUM ')
    .replace(/[+\-*/=<>≤≥∑∏√^|]+/g,' OP ').replace(/[^a-z0-9_]+/g,' ').trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let t of raw) {
    if (t.length < 3 || STOP.has(t)) continue;
    if (t==='num'||t==='code'||t==='greek'||t==='op') { out.push(t.toUpperCase()); continue; }
    t = gStem(t); out.push(REL.get(t) || t);
  }
  return out.length ? out : ['EMPTY'];
}
function repair(tokens) {
  let seq = tokens.slice(); let n = 0; const rules = [];
  while (seq.length >= 2) {
    const freq = new Map();
    for (let i=0;i<seq.length-1;i++){ const k=seq[i]+''+seq[i+1]; freq.set(k,(freq.get(k)||0)+1); }
    let best=null,bestN=1;
    for (const [k,c] of freq){ if (c>bestN || (c===bestN && best!==null && k<best)){best=k;bestN=c;} }
    if (!best || bestN<2) break;
    const [a,b]=best.split(''); const sym='R'+(n++); rules.push([sym,a,b]);
    const nx=[]; for (let i=0;i<seq.length;i++){ if (i<seq.length-1&&seq[i]===a&&seq[i+1]===b){nx.push(sym);i++;} else nx.push(seq[i]); } seq=nx;
  }
  return { seq, rules };
}
function grammarLen(text) { const toks=grammarTokens(text); const g=repair(toks); return g.seq.length + g.rules.length*2 + Math.sqrt(new Set(toks).size); }
export function grammarNcd(x, y, opts = {}) {
  const minChars = opts.minChars ?? MIN_CHARS;
  const a=String(x||''), b=String(y||'');
  if (a.trim().length<minChars||b.trim().length<minChars) return { d:0.5, lowQuality:true };
  const cx=grammarLen(a), cy=grammarLen(b), cxy=grammarLen(a+'\nBOUNDARY\n'+b);
  const denom=Math.max(cx,cy);
  if (!Number.isFinite(denom)||denom<=0) return { d:0.5, lowQuality:true };
  return { d: clamp01((cxy-Math.min(cx,cy))/denom), lowQuality:false };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// V2 DISTANCE CORE — fieldDistance (owner-chosen). Externalize the source side: classify each
// text to an ACADEMIC FIELD by a general field lexicon (NOT fit to the logbook), then distance =
// gap on a 1-D "distance-from-software/systems" scale. This is the register the same-voice
// summaries lack — a Kalman one-liner is control-theory, a Hopfield one-liner is neuroscience,
// regardless of how the catalog phrases them. (DeepSeek's externalize-the-source mitigation +
// Kimi's taxonomyDistance, grounded.) Used as the DISTANCE axis; the BRIDGE axis stays
// operator-skeleton (mechanism reconstruction). Validation = the value composition + blind holdout,
// NOT logbook-P1 (which is near-tautological once distance is field-based, by construction).
// ───────────────────────────────────────────────────────────────────────────────────────────

// Field-defining canonical terms (DeepSeek rework, locally-verified). Stems matched by prefix;
// terms are stem-compatible (e.g. 'freenerg','actinfer' survive stemTok). Insertion ORDER is the
// tie-breaker (first field with max hits wins) → specialized proper-noun fields BEFORE generic
// math fields, so a Friston/UCB/VCG hit beats a posterior/maximiz/predict hit.
export const FIELD_LEXICONS = { // exported for independent audit (RED-TEAM: was module-private)
  // ── specialized / far (proper-noun anchored — checked first to win ties) ──
  physics_neuro:    ['hopfield','associative','attractor','crosstalk','ising','spin','friston','capacity','amit','hebbian','freenerg','actinfer','markovblanket','bayesianbrain','predictivecod','generativemodel','karlfriston','surprisal'],
  topology:         ['homology','persistent','filtration','betti','simplicial','unionfind','barcode','manifold','persistence','tda'],
  game_economics:   ['vcg','vickrey','clarke','auction','mechanismdesign','incentive','externality','pivot','equilibrium','utility','peerprediction','marketscor','logarithmicmarket','hanson','lmsr','truthserum','prelec','witkowski','correlatedag'], // RED-TEAM: +hanson/marketscor/logarithmicmarket restore card 27 (LMSR)
  survival_reliab:  ['cox','hazard','weibull','bathtub','survival','proportional','burnin','renewal','failurerate','inspectionparadox'],
  causal_inference: ['pearl','dooperator','counterfactual','intervention','ablation','structuralcausal','backdoor','necessity'],
  ml_bandit:        ['thompson','ucb','bandit','hedge','multiplicativeweight','exploration','posteriorsampling','gittins','reward','noregret','optimism'], // RED-TEAM: dropped 'arm' (matched 'arms'/'warm' polysemy)
  control_systems:  ['mpc','recedinghorizon','modelpredictive','terminalset','terminalinvariant','feasib','dynamical','statespace','reachab','observ','detect','pbh','unobserv'],
  consensus_dist:   ['byzantine','quorum','pbft','faulttolerance','sensorfusion','dempster','shafer','queuing','erlang','little'], // RED-TEAM: dropped dead 'martingale' (stemTok→'martingal' never matched; card 13 → statistics)
  graph_theory:     ['laplacian','fiedler','spectral','eigenvector','percolation','articulation','tarjan','ricci','curvature','betweenness','giantcomponent','cheeger','conductance'],
  control_signal:   ['kalman','filter','estimat','controll','feedback','lyapunov','riccati','innovation','residual','cusum','changepoint','drift','recursi','predictor'],
  // ── core CS adjacency / generic math (checked last) ──
  info_theory:      ['entrop','divergence','compression','mdl','descriptionlength','descriptlength','minimumdescript','rissanen','mutualinformation','kolmogorov','bits','coding','bregman','maxent','bottleneck'], // RED-TEAM: +rissanen/descriptlength restore card 14 (MDL prose stems to descript+length, not 'mdl')
  optimization:     ['gradient','convex','regret','mirror','ogd','lagrangian','kkt','dual','minimiz','maximiz','onlinelearning','variational'],
  statistics:       ['bayes','posterior','prior','brier','conformal','credible','fisher','beta','likelihood','quantile','frequentist','pvalue','credal','imprecis','jeffrey','evalu','vovk','wang','testmartingal','savi','anytimevalid','ramda','grunwald','precisionweight','inversevarianc','covarianceintersect'],
};
// A-priori distance of each field from software/systems engineering, set by the field's HOME
// discipline relative to CS/SE (DeepSeek rework, with per-field justification in the build plan). [0,1].
export const FIELD_TO_SYSTEMS = { // exported for audit; per-field justification in the build plan
  systems: 0.0,
  statistics: 0.15, info_theory: 0.18, optimization: 0.20, ml_bandit: 0.25,   // core CS adjacency
  control_signal: 0.30, graph_theory: 0.35, consensus_dist: 0.42, control_systems: 0.50, // neighboring eng
  causal_inference: 0.55, survival_reliab: 0.58, game_economics: 0.72,         // specialized
  topology: 0.85, physics_neuro: 0.90,                                          // pure/external science
  unknown: 0.5,
};

export function fieldClassify(text) {
  const toks = tokenize(String(text || '').replace(/-/g, '')).map((t) => stemTok(t)); // de-hyphen first (e-value, receding-horizon, peer-prediction split wrong otherwise)
  const joined = toks.join('');               // de-spaced → matches tokenizer-split multiword terms
  const spaced = ' ' + toks.join(' ') + ' ';   // (freeenergy, dooperator, mechanismdesign, ...)
  let best = 'systems', bestScore = 0;        // default: YURI-native systems prose
  for (const [field, terms] of Object.entries(FIELD_LEXICONS)) {
    let hits = 0;
    for (const term of terms) {
      let hit;
      if (term.length >= 8) {
        // long/multiword term (freeenergy, dooperator, generativemodel): de-spaced substring is safe
        hit = joined.includes(term) || spaced.includes(' ' + term);
      } else {
        // short term: require a NEAR-WHOLE-TOKEN match — RED-TEAM fix: the old joined.includes()
        // + prefix-5 fuzzy fired 'arm'⊂'warm' and 'gener'⊂'general'→generativemodel (false fields).
        hit = toks.some((t) => t === term || (t.length >= 4 && Math.abs(t.length - term.length) <= 2 && (t.startsWith(term) || term.startsWith(t))));
      }
      if (hit) hits += 1;
    }
    // RED-TEAM round-2 fix: tie-break by INSERTION ORDER (lexicons are ordered specialized→generic,
    // proper-noun-anchored fields first). The nearest-systems tie-break regressed 'Hopfield posterior'
    // →statistics and 'renewal-reward'→ml_bandit (a generic term tied a proper-noun anchor and won by
    // being nearer systems). Insertion-order is now SAFE because the length-gated matcher already
    // killed the spurious short-term matches that originally motivated nearest-systems.
    if (hits > bestScore) { bestScore = hits; best = field; }
  }
  return { field: bestScore > 0 ? best : 'systems', hits: bestScore };
}

/**
 * fieldDistance — distance of x's ACADEMIC FIELD from software/systems (the YURI target's native
 * field). We deliberately do NOT classify y: the YURI target is systems-native by construction, and
 * the transfer prose leaks source vocabulary (author pre-bridging — the same effect that broke
 * text-NCD), which would collapse the distance to 0. distance = scale(field(x)). The BRIDGE axis
 * (reconFn) handles the mechanism against the real target text separately.
 */
export function fieldDistance(x, y, opts = {}) {
  const cx = fieldClassify(x);
  const sx = FIELD_TO_SYSTEMS[cx.field] ?? FIELD_TO_SYSTEMS.unknown;
  return { d: clamp01(sx), lowQuality: cx.hits === 0, field: cx.field, hits: cx.hits };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// mechanismFrameDistance (Codex/gpt-5.5 lane) — the strengthened BRIDGE recon. Classifies a
// mechanism into a FAMILY (curated taxonomy) + measures specific-term coverage + operator overlap,
// so recon(M,X) is HIGH only when M's actual mechanism is present in X — recovering robust P3 and
// killing the wrong-mechanism / noun-only theater. NOTE (honest): MECH_FAMILIES is a curated list
// seeded from the logbook mechanisms; it is EXTENSIBLE but partly logbook-fitted — a new mechanism
// outside the families falls back to operator-overlap. Residual (Codex): a prose bridge cannot see
// a missing IMPLEMENTATION prerequisite (MPC/VCG blockers) — that needs a separate prerequisite gate.
const MECH_STOP = new Set(['the','and','for','with','that','this','from','into','onto','than','then','when','where','which','while','under','over','each','only','must','will','not','but','are','was','were','been','being','via','its','their','our','your','one','two','three','same','new','real','first','second','add','replace','use','using','used','have','has','had','can','could','should','would','before','after']);
const MECH_GENERIC = new Set(['system','data','value','result','thing','item','part','area','field','table','record','context','process','model','source','target','input','output','step','node','edge','claim','evidence','memory','graph','lane','energy','gate','score','rank','weight','threshold','metric','function']);
function mechStem(t) { return String(t).toLowerCase().replace(/[^a-z0-9]/g,'').replace(/(ization|isation)$/u,'ize').replace(/(ingly|edly)$/u,'').replace(/(ational|ation)$/u,'ate').replace(/(ing|ed|es|s|ly|ity|ies|ion|al|ic|ive|ment)$/u,'').replace(/e$/u,''); }
const MECH_FAMILIES = {
  kalman: ['kalman','predict','update','innovation','variance','covariance','nis','noise','recursive','estimator','filter'],
  cusum: ['cusum','cumulative','sum','drift','alarm','changepoint','arl','statistic'],
  spectral: ['spectral','laplacian','fiedler','eigen','cluster','component','lambda','conductance','cut'],
  mdl: ['minimum','description','length','compress','redundant','irreducible','marginal','bits'],
  percolation: ['percolation','articulation','bridge','tarjan','component','giant','fracture','robustness'],
  causalAblation: ['dooperator','counterfactual','ablation','intervention','remove','delete','rerun','effect','necessity','loadbearing'],
  martingale: ['martingale','evalue','wealth','bet','betting','null','anytime','ville','lambda','alpha','crossing','mean'],
  cox: ['cox','hazard','baseline','covariate','beta','failure','survival','decay','partial','likelihood'],
  hopfield: ['hopfield','associative','capacity','crosstalk','interference','saturation','overlap','pattern','spurious','attractor'],
  persistence: ['persistent','persistence','homology','filtration','threshold','sweep','unionfind','union','find','component','barcode','bar','singlelinkage'],
  freeEnergy: ['freeenergy','friston','variational','complexity','accuracy','surprise','kl','prior','posterior','precision','bound','inference'],
  mpc: ['mpc','predictive','horizon','terminal','feasible','constraint','replan','continuation','receding','state'],
  observability: ['observability','detectability','observable','channel','reachable','rank','missing','state','measurement'],
  vcg: ['vcg','vickrey','clarke','groves','externality','harm','fanout','dependent','price','auction','incentive'],
};
function canonicalMechanismText(text) { return String(text || '').toLowerCase().replace(/do-operator/g,'dooperator').replace(/free energy/g,'freeenergy').replace(/union-find/g,'unionfind').replace(/single-linkage/g,'singlelinkage').replace(/e-values?/g,'evalue'); }
function mechanismProfile(text) {
  const raw = canonicalMechanismText(text);
  const toks = tokenize(raw).map(mechStem).filter((t) => t.length >= 3 && !MECH_STOP.has(t));
  const set = new Set(toks); const joined = toks.join(''); const famScores = new Map();
  for (const [fam, terms] of Object.entries(MECH_FAMILIES)) {
    let hits = 0;
    for (const term of terms) { const st = mechStem(term); if (set.has(st) || joined.includes(st)) hits += 1; }
    const named = terms.slice(0, 3).some((term) => { const st = mechStem(term); return set.has(st) || joined.includes(st); });
    if (hits >= 2 || named) { famScores.set(fam, hits); for (const term of terms) set.add(mechStem(term)); }
  }
  return { set, famScores, specific: [...set].filter((t) => !MECH_GENERIC.has(t)) };
}
function mechanismCoverage(needles, haystack) { if (!needles.length) return 0; let hit = 0, den = 0; for (const t of needles) { const w = MECH_GENERIC.has(t) ? 0.25 : 1; den += w; if (haystack.has(t)) hit += w; } return den ? hit / den : 0; }
function mechanismFamilySim(m, x) { let den = 0, hit = 0; for (const [fam, w] of m.famScores) { den += w; if (x.famScores.has(fam)) hit += Math.min(w, x.famScores.get(fam)); } return den ? hit / den : 0; }
export function mechanismFrameDistance(mechanism, context, opts = {}) {
  const minChars = opts.minChars ?? MIN_CHARS;
  const m = String(mechanism || ''); const x = String(context || '');
  if (m.trim().length < minChars || x.trim().length < minChars) return { d: 0.5, lowQuality: true };
  const mp = mechanismProfile(m); const xp = mechanismProfile(x);
  const op = operatorSkeletonDistance(m, x, { ...opts, minChars: Math.min(minChars, 60) });
  const opSim = op.lowQuality ? 0 : 1 - op.d;
  const family = mechanismFamilySim(mp, xp);
  const coverage = mechanismCoverage(mp.specific, xp.set);
  const nounOnly = op.lowQuality || op.nx < 2;
  let sim = 0.55 * family + 0.25 * coverage + 0.20 * opSim;
  if (nounOnly) sim *= 0.25;
  // RED-TEAM fix: family=0 means "no curated signature for this mechanism", NOT "mechanism absent".
  // Only crater the score when there is ALSO no specific coverage AND no operator overlap (genuinely
  // nothing shared); otherwise keep the partial signal and mark low-confidence so the caller treats
  // it as UNCERTAIN, not as proven non-reconstruction. (Deep fix — apply feature-expansion to the
  // bridge so different-words-same-structure aligns — is queued; mechanismFrame is logbook-seeded.)
  const unknownFamily = family === 0;
  if (unknownFamily && coverage < 0.18 && opSim < 0.18) sim *= 0.45;
  return {
    d: clamp01(1 - sim),
    lowQuality: (nounOnly && coverage < 0.12) || (unknownFamily && coverage < 0.12 && opSim < 0.12),
    family, coverage, opSim, nx: op.nx,
  };
}

export const CANDIDATES = {
  operatorSkeleton: operatorSkeletonDistance,
  mechanismFrame: mechanismFrameDistance,
  brotliNcd,
  cdm: cdmDistance,
  grammarNcd,
  fieldDistance,
};

// The verified V2 ship config: field-distance (DISTANCE axis — degree of farness) ×
// mechanism-frame (BRIDGE axis — does the mechanism actually reconstruct on both sides).
// Bake-off verified: P1=0.25 separation, P1/P2/P3/P4 all pass. Use this, not raw transferScore.
export const V2_CONFIG = Object.freeze({ distFn: fieldDistance, reconFn: mechanismFrameDistance });
export function scoreTransferV2(t) { return transferScore(t, V2_CONFIG); }
