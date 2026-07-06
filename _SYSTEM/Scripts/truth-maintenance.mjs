// _SYSTEM/Scripts/truth-maintenance.mjs
//
// Roadmap organ 3 — JTMS (Doyle-style justification-based truth maintenance).
// Deterministic logic, zero ML, pure in-memory, no IO, no deps.
//
// Dock points:
//   • claim-and-evidence ledger — each claim = TMS node; evidence = justification.
//   • memory-kernel Track A — a memory's SEE/[[links]] become justification candidates
//     (e.g. addJustification({consequent:'claim-Y', inList:['mem-X'], informant:'memory-link'})).
//   • retirement events — retract the retired premise; affectedBy surfaces what breaks;
//     takeReviewQueue surfaces the blast radius for human review.
//
// Worked example — RAG retirement scenario:
//   const tms = createTms();
//   assertPremise(tms, 'rag-v1',         'initial-setup');
//   assertPremise(tms, 'embedding-model', 'model-choice');
//   addJustification(tms, {consequent:'rag-pipeline', inList:['rag-v1','embedding-model'],
//     informant:'pipeline-dep'});
//   addJustification(tms, {consequent:'rag-ui', inList:['rag-pipeline'], informant:'ui-dep'});
//   // All four nodes IN.
//   retract(tms, 'rag-v1');              // retirement event
//   // rag-pipeline, rag-ui → OUT; both appear in review queue.
//   affectedBy(tms, 'rag-v1')            // → Set {'rag-pipeline','rag-ui'}
//   takeReviewQueue(tms)                 // → [{id:'rag-pipeline',formerSupport:'pipeline-dep'},…]

// ---- exports ----

/** createTms: create a fresh in-memory truth maintenance store. */
// @capability: truth-maintenance
// @serves: justification-based truth maintenance | JTMS | belief revision | what depends on this premise | retract and repropagate | in/out labeling
// @does: roadmap organ 3 — Doyle-style JTMS (justification-based truth maintenance): assertPremise, addJustification, retract, label (in/out), affectedBy; deterministic, in-memory, zero ML
// @use: when claims have dependency justifications and retracting one must repropagate (belief revision) track what's currently believed and what a retraction invalidates; pairs with claim-evidence-cortex
// @exports: createTms, assertPremise, addJustification, retract, label, affectedBy
export function createTms() {
  return {
    _nodes: new Map(),          // nodeId → { id }
    _justifications: new Map(), // jid → { id, consequent, inList, outList, informant }
    _labels: new Map(),         // nodeId → 'IN' | 'OUT'
    _supports: new Map(),       // nodeId → jid  (which justification marked it IN)
    _queue: [],                 // [{ id, formerSupport }]
    _nextJid: 1,
  };
}

/** assertPremise: assert id as an unquestioned premise (empty inList+outList justification). */
export function assertPremise(tms, id, informant = 'premise') {
  _ensureNode(tms, id);
  _withRelabel(tms, () => {
    const jid = tms._nextJid++;
    tms._justifications.set(jid, { id: jid, consequent: id, inList: [], outList: [], informant });
  });
}

/** addJustification: register {consequent, inList, outList, informant} then relabel. Returns jid. */
export function addJustification(tms, { consequent, inList = [], outList = [], informant = '' }) {
  _ensureNode(tms, consequent);
  for (const x of inList)  _ensureNode(tms, x);
  for (const x of outList) _ensureNode(tms, x);
  let jid;
  _withRelabel(tms, () => {
    jid = tms._nextJid++;
    tms._justifications.set(jid, {
      id: jid, consequent,
      inList: [...inList], outList: [...outList], informant,
    });
  });
  return jid;
}

/** retract: remove a justification by jid or by premise node id, then relabel. */
export function retract(tms, jidOrNodeId) {
  let jid;
  if (tms._justifications.has(jidOrNodeId)) {
    jid = jidOrNodeId;
  } else {
    for (const [i, j] of tms._justifications) {
      if (j.consequent === jidOrNodeId && j.inList.length === 0 && j.outList.length === 0) {
        jid = i; break;
      }
    }
  }
  if (jid == null) return;
  _withRelabel(tms, () => { tms._justifications.delete(jid); });
}

/** label: return 'IN', 'OUT', or 'UNKNOWN' (node never mentioned). */
export function label(tms, id) {
  return tms._labels.has(id) ? tms._labels.get(id) : 'UNKNOWN';
}

/** affectedBy: transitive set of node ids whose label could depend on id via justification edges. */
export function affectedBy(tms, id) {
  const adj = new Map();
  for (const j of tms._justifications.values()) {
    for (const dep of [...j.inList, ...j.outList]) {
      if (!adj.has(dep)) adj.set(dep, new Set());
      adj.get(dep).add(j.consequent);
    }
  }
  const result = new Set();
  const stack = [id];
  while (stack.length) {
    for (const n of (adj.get(stack.pop()) || [])) {
      if (!result.has(n)) { result.add(n); stack.push(n); }
    }
  }
  return result;
}

/** whySupported: justification tree for an IN node; null if OUT or UNKNOWN. */
export function whySupported(tms, id) {
  if (tms._labels.get(id) !== 'IN') return null;
  const jid = tms._supports.get(id);
  if (jid == null) return null;
  const j = tms._justifications.get(jid);
  if (!j) return null;
  return {
    id: j.consequent,
    informant: j.informant,
    inList: j.inList.map(n => whySupported(tms, n)),
    outList: [...j.outList],
  };
}

/** flagReview: return the count of pending IN→OUT review items (auto-queued by mutations). */
export function flagReview(tms) {
  return tms._queue.length;
}

/** takeReviewQueue: return and clear the [{id, formerSupport}] review queue. */
export function takeReviewQueue(tms) {
  const q = [...tms._queue];
  tms._queue.length = 0;
  return q;
}

/** toJSON: serialize full TMS state to a JSON string. */
export function toJSON(tms) {
  return JSON.stringify({
    n: [...tms._nodes.entries()],
    j: [...tms._justifications.entries()],
    l: [...tms._labels.entries()],
    s: [...tms._supports.entries()],
    q: tms._queue,
    nj: tms._nextJid,
  });
}

/** fromJSON: restore a TMS from a JSON string (inverse of toJSON). */
export function fromJSON(json) {
  const d = JSON.parse(json);
  const t = createTms();
  t._nodes = new Map(d.n);
  t._justifications = new Map(d.j);
  t._labels = new Map(d.l);
  t._supports = new Map(d.s);
  t._queue = d.q;
  t._nextJid = d.nj;
  return t;
}

// ---- internal helpers ----

/** _ensureNode: register a node id if not already present. */
function _ensureNode(tms, id) {
  if (!tms._nodes.has(id)) tms._nodes.set(id, { id });
}

/**
 * _withRelabel: snapshot labels + informants, run mutation, relabel, queue IN→OUT flips.
 * Informant capture runs BEFORE the mutator so retracted-justification informants survive.
 */
function _withRelabel(tms, mutator) {
  const oldLabels = new Map(tms._labels);
  const oldInformants = new Map();
  for (const [id, lbl] of oldLabels) {
    if (lbl === 'IN') {
      const j = tms._justifications.get(tms._supports.get(id));
      oldInformants.set(id, j?.informant ?? 'retracted');
    }
  }

  mutator();
  _relabelCore(tms);

  for (const [id, lbl] of oldLabels) {
    if (lbl === 'IN' && tms._labels.get(id) !== 'IN') {
      tms._queue.push({ id, formerSupport: oldInformants.get(id) ?? 'unknown' });
    }
  }
}

/**
 * _relabelCore: well-founded fixpoint using 3-valued semantics.
 *
 * Labels: I (IN), O (OUT), U (UNKNOWN).  A node resolves to:
 *   I  if ≥1 justification has all inList=I and all outList=O.
 *   O  if every justification has ≥1 inList=O or ≥1 outList=I,
 *      or the node has no justifications at all.
 *   U  otherwise (unresolved — mapped to OUT for the 2-valued surface).
 *
 * The fixpoint is monotone (U→I or U→O, never demoted), so it terminates
 * in at most |nodes| non-trivial passes and converges to the unique
 * well-founded model regardless of iteration order.
 *
 * Mutual-support cycles with no premise base stay U→OUT.
 * Nonmonotonic outList defaults resolve correctly: a node whose only
 * justification has outList=[E] is I while E is U/O, then flips to O
 * once E reaches I.
 */
function _relabelCore(tms) {
  const allNodes = new Set(tms._nodes.keys());
  for (const j of tms._justifications.values()) {
    allNodes.add(j.consequent);
    for (const id of j.inList)  allNodes.add(id);
    for (const id of j.outList) allNodes.add(id);
  }

  // consequent → [jid, justification][]
  const jof = new Map();
  for (const [jid, j] of tms._justifications) {
    if (!jof.has(j.consequent)) jof.set(j.consequent, []);
    jof.get(j.consequent).push([jid, j]);
  }

  // 3-valued fixpoint
  const val = new Map();
  for (const id of allNodes) val.set(id, 'U');

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of allNodes) {
      if (val.get(id) !== 'U') continue;
      const js = jof.get(id) || [];

      // canIn: ≥1 fully-valid justification (all inList I, all outList O)
      const canIn = js.some(([, j]) =>
        j.inList.every(n => val.get(n) === 'I') &&
        j.outList.every(n => val.get(n) === 'O'));

      // mustOut: every justification blocked (≥1 inList O or ≥1 outList I), or none exist
      const mustOut = js.length === 0 || js.every(([, j]) =>
        j.inList.some(n => val.get(n) === 'O') ||
        j.outList.some(n => val.get(n) === 'I'));

      if      (canIn && !mustOut) { val.set(id, 'I'); changed = true; }
      else if (mustOut && !canIn) { val.set(id, 'O'); changed = true; }
    }
  }

  // Map U→OUT, set supports for IN nodes
  tms._labels = new Map();
  tms._supports = new Map();
  for (const [id, v] of val) tms._labels.set(id, v === 'I' ? 'IN' : 'OUT');
  for (const id of allNodes) {
    if (tms._labels.get(id) !== 'IN') continue;
    for (const [jid, j] of (jof.get(id) || [])) {
      if (j.inList.every(n => tms._labels.get(n) === 'IN') &&
          j.outList.every(n => tms._labels.get(n) === 'OUT')) {
        tms._supports.set(id, jid);
        break;
      }
    }
  }
}
