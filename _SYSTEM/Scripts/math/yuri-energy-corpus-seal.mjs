#!/usr/bin/env node
// ===========================================================================
// CLAUDE CONTROL PACKET
//   goal:        Held-out corpus contamination SEAL for the calibration bakeoff.
//                Candidate G of the substrate-frontier-grade mission. Frontier
//                eval contamination-control → YURI weight calibration.
//   target:      NEW file only. A sealing primitive; does NOT wire into the
//                bakeoff (that is the owner-gated step) and changes no gate.
//   constraints: dependency-free except node:crypto; deterministic + order-
//                independent; observe-mode; reversible by deletion.
//   acceptance:  a sealed corpus verifies intact under reordering; any record
//                add/remove/value-change is DETECTED (negative controls).
//   test cmd:    node --test _SYSTEM/Scripts/math/yuri-energy-corpus-seal.test.mjs
//   rollback:    rm this file + its .test.mjs.
// ===========================================================================
//
// @capability: corpus-contamination-seal
// @serves: held-out corpus seal | detect calibration corpus tampering | contamination control for the bakeoff | prove the tuning corpus did not change mid-bakeoff | gradient-overfitting-by-corpus-edit guard
// @does: hashes a record corpus order-independently + content-sensitively (sha256 over sorted canonical JSON), seals it to {hash,count}, and detects any post-seal mutation (record added/removed/changed) via assert/verify
// @use: in the calibration bakeoff, seal the reject/accept corpus at entry then assert the seal before scoring — so a tune cannot quietly score against a corpus that was edited under it (the train/test-leak discipline applied to weight calibration)
// @exports: hashCorpusSlice, sealCorpus, assertCorpusSeal, verifyCorpusSeal, canonicalRecord, ContaminationError
//
// Frontier transfer: held-out / contamination control (Epoch AI, OpenAI eval
// hygiene) → YURI weight calibration. The bakeoff (yuri-energy-calibrate.mjs
// scoreRealData) scores a candidate against a reject/accept corpus; without a
// seal, the SAME corpus that motivated a candidate can be edited and re-scored,
// leaking gradient into the validation metric. This seals it.

import { createHash } from 'node:crypto';

export class ContaminationError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = 'ContaminationError';
    this.detail = detail;
  }
}

// Canonical, key-sorted JSON for one record — so key ORDER never changes the hash
// but any VALUE change does. Recurses through nested objects/arrays.
export function canonicalRecord(r) {
  const enc = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
    if (Array.isArray(v)) return `[${v.map(enc).join(',')}]`;
    const keys = Object.keys(v).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${enc(v[k])}`).join(',')}}`;
  };
  return enc(r);
}

// Order-independent, content-sensitive corpus hash: sort the per-record canonical
// strings, join, sha256. Reordering the corpus → same hash; adding/removing a
// record or changing any field → different hash.
export function hashCorpusSlice(records) {
  const list = Array.isArray(records) ? records : [];
  const canon = list.map(canonicalRecord).sort();
  return createHash('sha256').update(canon.join('\n')).digest('hex');
}

// Seal a corpus into a small fixture: {hash, count}.
export function sealCorpus(records) {
  const list = Array.isArray(records) ? records : [];
  return { hash: hashCorpusSlice(list), count: list.length };
}

// Non-throwing verifier: returns the full comparison.
export function verifyCorpusSeal(seal, records) {
  const actualHash = hashCorpusSlice(records);
  const actualCount = Array.isArray(records) ? records.length : 0;
  const expectedHash = seal && typeof seal.hash === 'string' ? seal.hash : null;
  const expectedCount = seal && Number.isFinite(seal.count) ? seal.count : null;
  return {
    intact: expectedHash != null && actualHash === expectedHash,
    expectedHash, actualHash, expectedCount, actualCount,
  };
}

// Throwing guard for the bakeoff entry point: fail-closed on any drift.
export function assertCorpusSeal(seal, records) {
  const v = verifyCorpusSeal(seal, records);
  if (!v.intact) {
    throw new ContaminationError(
      `corpus changed post-seal: expected ${v.expectedHash} (n=${v.expectedCount}) got ${v.actualHash} (n=${v.actualCount})`,
      v,
    );
  }
  return true;
}

// CLI smoke: seal a corpus, prove reorder is intact + a value change is detected.
if (import.meta.url === `file://${process.argv[1]}`) {
  const corpus = [
    { id: 'r1', U: 1.2, accept: false }, { id: 'r2', U: -0.3, accept: true }, { id: 'r3', U: 5.0, accept: false },
  ];
  const seal = sealCorpus(corpus);
  const reordered = [corpus[2], corpus[0], corpus[1]];
  const tampered = corpus.map((r) => (r.id === 'r2' ? { ...r, U: 99 } : r));
  const removed = corpus.slice(0, 2);
  console.log(`seal: ${seal.hash.slice(0, 16)}… n=${seal.count}`);
  console.log(`reorder intact:  ${verifyCorpusSeal(seal, reordered).intact}  (must be true)`);
  console.log(`tamper detected: ${!verifyCorpusSeal(seal, tampered).intact}  (must be true)`);
  console.log(`remove detected: ${!verifyCorpusSeal(seal, removed).intact}  (must be true)`);
  const ok = verifyCorpusSeal(seal, reordered).intact
    && !verifyCorpusSeal(seal, tampered).intact
    && !verifyCorpusSeal(seal, removed).intact;
  console.log(`\n${ok ? 'OK' : 'FAILURE'}: seal is order-independent + tamper-sensitive`);
  process.exit(ok ? 0 : 1);
}
