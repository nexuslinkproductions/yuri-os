---
name: gitnexus-query-is-lexical-context-is-structural
description: "GitNexus `query` is BM25+vector LEXICAL search (returns files that contain the string, incl. .md/.json); only `context` incoming/outgoing carries real call-graph edge-kinds. Never stamp query-recall hits with a fabricated edge-kind and grade them structural."
metadata: 
  node_type: memory
  type: feedback
  tier: working
  scope: main
  trig: 
    - gitnexus
    - query
    - context
    - structural
    - propagation-scan
    - cross-reference
    - edge-kind
    - call-graph
  refs: 
    - "[[delta-gate-severity-laundering]]"
    - "[[completeness-cert-needs-total-counts]]"
    - "[[cross-reference-engine]]"
  originSessionId: 2448e5f4-5e5f-4625-bfa9-db81dc67ab4c
---

RULE: GitNexus `query` = BM25 keyword + semantic vector retrieval (LEXICAL — surfaces any file containing the token, including .md/.json/docs). GitNexus `context` incoming/outgoing = the typed call-graph (the only surface that carries real `calls`/`reads`/`writes` edge-kinds). They are NOT interchangeable.

WHEN: building anything that claims STRUCTURAL sibling/impact/mechanism matching over the GitNexus CLI (propagation-scan, cross-ref engine, any "mechanism-twin not vocabulary-twin" instrument).

DO: use `query` for RECALL only — to NOMINATE candidate files. Then GATE each candidate through a real structural check: `context <candidate>` outgoing must contain the witness symbol on a `calls`/`reads` edge (confirm via the candidate's OUTGOING, not the witness's incoming — the index drops incoming edges, e.g. it drops shintai-dispatch->traceDispatchEvent). Only a context-confirmed candidate earns the structural/HIGH band. AND-gate (intersect query∩context), never OR-union. Hard-exclude prose/data files (.md/.json/.txt) and protected paths from the structural surface regardless of node.files membership — a call edge cannot originate from markdown.

DONT: union `query` results into the structural surface; overwrite a query hit's honest `reference` kind with a fabricated `calls`; let a `fileToNodes.has(path)` membership filter be the ONLY thing keeping lexical twins out (that's corpus-incidental, not a guarantee). Don't trust a green acceptance test that could have passed via the lexical leg — add a negative fixture where `query` returns a .md NOT in `context` and assert it is NOT surfaced as structural.

WHY: same severity-laundering as [[delta-gate-severity-laundering]] — a weak (lexical) signal relabeled into a strong (structural 0.97) band. Caught by the independent verify leg of the propagation-scan build (2/3 axes holds=false, path:line cited) AFTER the build agent's own self-attack missed it — proof the adversarial cert loop must be independent, not self-graded.

SEE: _SYSTEM/Scripts/propagation-scan.mjs · 02_RESOURCES/RESEARCH/yuri-math-engine-and-propagation-roadmap-2026-06-04.md §4
