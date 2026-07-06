---
name: completeness-cert-needs-total-counts
description: "A completeness/coverage certificate over a TRUNCATED retrieval engine is severity-laundering unless it carries real total-match counts — 'exhausted' over a top-N prefix is a lie the wrapper can't even detect."
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: main
  trig: 
    - completeness
    - coverage
    - certificate
    - receipt
    - exhaust
    - recall
    - navigation
    - retrieval
  refs: 
    - "[[delta-gate-severity-laundering]]"
    - "[[feedback-adversarial-persona-attack-loop]]"
    - "[[feedback-prose-not-outrun-wiring]]"
  originSessionId: 2448e5f4-5e5f-4625-bfa9-db81dc67ab4c
---

RULE: Any coverage/completeness certificate is only honest if it reads the **total population per source** and reports `{returned, totalMatched, truncated}` — never just the returned set.

WHEN: building a "completeness guarantee", coverage receipt, recall bound, or any cert that claims a search/scan saw everything relevant (the NAVIGATION/master-nav synthesis, 2026-06-05).

DO: add a real total-match read per surface (`SELECT COUNT(*) ... MATCH ?` for FTS5; uncapped counts for graph/spectrum; total-symbol count for gitnexus). Reserve "guaranteed/provable" for properties the code can actually prove (liveness: "the leg ran + returned valid JSON"), NOT for a bounded sample. Emit unmeasured recall as `recallBound: null, confidence: 'unmeasured'` — a null, not a guessed float behind a low-confidence flag. Report a fail-soft empty (`catch {}`) as "surface errored, recall=0, UNKNOWN", never "searched, nothing found".

DONT: wrap a truncated engine (live `xref-query.mjs` caps: FTS5 LIMIT 30, graph/spectrum slice 20, gitnexus --limit 8, merge top 10, no `COUNT(*)` anywhere) and stamp the top-N prefix "exhausted." Don't HMAC-sign the result set and imply you signed the completeness claim — re-derivation reproduces the same truncated passes and cannot detect missed-below-cap hits (tamper-evidence for the wrong property).

WHY: the same severity-laundering as [[delta-gate-severity-laundering]] — a strong word ("guaranteed", "complete") welded to a weak, partition-able mechanism. The wrapper doesn't even *know* what it missed, so the dishonesty is undetectable from inside. Caught by the adversarial-verify leg of the nav-proposals synthesis (all 3 axes holds=false); the design's own skeleton was sound but the completeness claim outran the wiring.

SEE: 02_RESOURCES/RESEARCH/nav-proposals/lens-synthesis-CONVERGED-2026-06-05.md
