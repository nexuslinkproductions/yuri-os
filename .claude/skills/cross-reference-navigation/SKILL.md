---
name: cross-reference-navigation
description: "Fuse FTS5 + circuitry-graph + GitNexus + mechanism-spectrum into one confidence-graded retrieval front-door, faster than scanning each surface separately. Use this before broad exploration, grep, or any 'where is / what is this / find the code / what already exists' question. Also covers propagation-scan and capability-recall."
invocation: model
triggers:
  - "/xref"
  - "cross reference"
  - "navigate code"
  - "where is"
  - "find the code"
  - "what already exists"
  - "before broad exploration"
---

# Cross-Reference Navigation (XREF)

The GROUND step of the work loop, made reflexive. One question asked across all four siloed retrieval surfaces at once, returned as one merged, deduped, **confidence-graded** result set. Reach for this before grep, before reading a tree, before "let me explore" — it is faster and it tells you how much to *trust* each hit, which raw grep never does.

## Use When

- Starting any non-trivial task: **run xref first** (the standing CLAUDE.md mandate).
- "Where is X / what is this / what calls this / what already exists for need Y."
- Before building a new primitive — xref auto-surfaces ⚡ capability hits at the top (capability-first).
- Locating siblings of a known circuitry node (use `--node`).

## Skip When

- You already know the exact file+line (just Read it — don't spawn navigation).
- Pure single-file edits with no unknowns.

## The command

```bash
node _SYSTEM/Scripts/xref-query.mjs "<natural-language query>"          # default merged read
node _SYSTEM/Scripts/xref-query.mjs "<query>" --node <circuitry-node>   # + 1-hop graph neighbors
node _SYSTEM/Scripts/xref-query.mjs "<query>" --top 1000 --scan 5000    # widen the aperture
node _SYSTEM/Scripts/xref-query.mjs "<query>" --all --json              # broad recall, machine-readable
```

- `--node <id>` surfaces 1-hop neighbors of a circuitry node, tagged by edge kind (`calls`/`reads` → MED; **`writes` edges are excluded** — verified data-flow ≠ shared mechanism).
- `--top N` / `--scan N` scale the candidate pool — there is **no** hard 50-result cap; ask for thousands when you need breadth.
- `--all` drops the FTS5/spectrum SQL slice for a broad recall aperture.
- `--json` for structured consumption.
- Pure read: never mutates, never writes, never touches protected paths.

## Reading the output (the confidence model is the point)

Every merged hit is graded by the shared `xref-provenance.scoreHit` model and theater-gated:

| evidenceKind | confidence | meaning |
|---|---|---|
| `gitnexus-structural` | HIGH 0.8–1.0 | a real typed call-graph edge — trust it (downranked if the index is stale vs HEAD) |
| graph-neighbor (`calls`/`reads`) | MED | circuitry-graph adjacency |
| `lexical-only` | LOW < 0.55 | text overlap only; **suppressed to the low-confidence sub-log** unless it names a mismatch |

A sub-0.55 hit with no named mismatch is hidden from the main surface (theater-gate). Take HIGH structural hits as load-bearing; treat lexical-only as a lead, not proof.

## Footguns (verified, designed-in — do not "simplify" them away)

- **Two indexed yuri-os repos exist** (live root + a stale worktree at `.claude/worktrees/vault-restructure`). The gitnexus `--repo` is PINNED to the live absolute root; an unpinned query can silently hit the wrong graph. xref already pins it — don't reimplement around it.
- **No "semantic" search.** gitnexus embeddings = 0 → BM25/keyword ranking only; the structural leg is a typed call-graph proxy, not vector search. The tool never claims "semantic"; neither should you.
- **Fail-CLOSED structural leg.** If gitnexus is missing/throws/empty, `structuralLegAvailable=false` and every would-be-structural hit is capped at the lexical ceiling + tagged `structuralUnavailable` — never silently presented as structurally corroborated. If you see that tag, the HIGH tier is unavailable that run (often the egress/subprocess block in this sandbox), not "no structural hits."

## Pair with

- **`capability-recall.mjs "<need>"`** — run FIRST before building anything; xref also folds ⚡ capability hits into its top results.
- **`propagation-scan.mjs <node-id> --dry-run`** — when a known circuitry node is in scope, apply the propagation law (note: the gitnexus structural leg can emit a bare `AggregateError` under the sandbox egress block — that's environment, not a code fault; redirect to a file to read cleanly).
- **GitNexus tools** (`gitnexus_impact`, `gitnexus_context`) — for symbol-level impact before editing.

## Session Notes

- 2026-06-13 — Skill created during the autonomous run after Marcel flagged "we have a new upgraded xref that can help." Grounded in `_SYSTEM/Scripts/xref-query.mjs` header (XREF-01..05): 4 fused surfaces, scoreHit grading, theater-gate, fail-closed structural leg, the F1–F3 footguns. Tools used: Bash (grep/sed reads), capability-recall (confirmed registered as `code-navigation-search`). No corrections. Residual: xref's full live run wasn't exercised this session (sandbox egress blocks the gitnexus subprocess leg); the FTS5/graph/spectrum legs run clean.
