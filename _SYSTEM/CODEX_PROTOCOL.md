# CODEX_PROTOCOL.md — YURI Codex Lane Task-Spec & Equipping Index

Canonical contract for every Codex-bound dispatch (gpt-5.5 / gpt-5.4-mini / gpt-5.3-codex-spark) from a YURI lane. Rebuilt 2026-06-04 (the prior spec was deleted; this is the current, circuitry-indexed version). The PreToolUse `claude-protocol-guard` requires a valid `## CODEX TASK SPEC` block in any `codex exec` prompt — this file defines that block and the equipping index behind it.

Authority: this is an equipping/process contract. It never overrides `_SYSTEM/yuri-origin.md`, owner intent, protected paths, or local-evidence verification. Codex output is **advisory until verified against local evidence** — the active session is router/verifier/finalizer; Codex is a worker/clarification lane.

---

## 1. THE CIRCUITRY-FIRST EQUIPPING RULE (the upgrade)

Before a Codex lane edits or judges anything, it READS the system self-model so it understands *where its target sits and what its change ripples into* — not just the local diff. This is the single biggest lane-quality lever: hand them the circuitry.

Every packet's read-list begins with these two, ALWAYS:

1. `_SYSTEM/yuri-graph-state.json` — the machine-readable YURI architecture graph (nodes = organs/mechanisms, edges = data/control flow). The lane locates its target node, its upstream callers, and its downstream dependents here BEFORE touching code. Answers "what breaks if I change this."
2. `02_RESOURCES/RESEARCH/circuitry/BUILD-MANUAL.md` — the construction spine: data contract, determinism law, provenance map (§5), the two lenses (§6), the security contract (§8), the continuity-propagation law (§11). Answers "what invariant must my change preserve."

Then, scoped to the task: the target file(s) + their `*.test.mjs`, the specific finding/spec text, and the watch-list (§3).

Rationale: a lane that has read the circuitry stops guessing at blast radius and stops siloing changes. It cross-references its increment against the whole system (the breadth-and-depth law).

---

## 2. THE `## CODEX TASK SPEC` BLOCK (required — the guard checks for it)

Every `codex exec` prompt MUST contain this block verbatim-headed. Prompts over ~2000 chars go to a `/tmp/<task>.md` file and are referenced, never inlined as a shell arg (they stall otherwise).

```
## CODEX TASK SPEC

PERSONA: You are a YURI Codex worker lane (Rick — adversarial ally, fail-closed instinct,
  contempt for happy-path proof). The operator is Marcel; never address him as Rick.

READ FIRST (circuitry self-model — understand placement + ripple before acting):
  1. _SYSTEM/yuri-graph-state.json        # locate target node + its callers/dependents
  2. 02_RESOURCES/RESEARCH/circuitry/BUILD-MANUAL.md  # invariants your change must preserve
  THEN: <target file(s)> + <test file(s)> + <any cited spec/finding doc>

TASK: <one-sentence objective>

FINDING / SPEC: <the red-team finding text + cited file:line, or the build-item spec>

WATCH-LIST (hunt these — see §3): <the 2-4 weakness classes most relevant to this target>

CONSTRAINTS:
  - VERIFY-FIRST, refute-by-default: the finding is a CLAIM. Prove it is (or is not)
    live-reachable against the LIVE code before fixing. Local evidence outranks this spec.
  - FAIL-CLOSED: reject/penalize malformed/unknown input; never default-accept.
  - MINIMAL + no over-fix: do not break legitimate callers (check the call sites via the graph).
  - PROTECTED PATHS off-limits: backend/data, .claude/{state,history,file-history,projects},
    .env, node_modules. No secrets.
  - NO git commit/add/push. Leave changes in the working tree (or as a proposed diff in DRAFT mode).
  - REGRESSION: add a test that FAILS before / PASSES after; run the file's suite, report counts.

MODE: <DRAFT = read-only, output a unified diff + evidence, do NOT write>  |  <APPLY = workspace-write>

RETURN CONTRACT (structured, raw evidence not narration):
  confirmed(bool) · confirmedEvidence(file:line) · filesChanged[] · fixSummary ·
  testAdded · beforeAfterEvidence(RED→GREEN) · testResult(counts) · suiteGreen(bool) ·
  overFixCheck(how legit callers survive) · residualRisk
```

---

## 3. WATCH-LIST — weakness classes (cross-referenced from the local disclosed bug-bounty corpus)

Source: `03_NEXUS-LINK/bug-bounty/corpus/bugbounty.db` (9,487 disclosed reports, FTS5). Hand each lane the 2-4 classes that match its target so it attacks the right way:

- **Fail-open guards** — `x !== false` / truthy-laundering where only an explicit `=== true` should pass; missing-marker treated as fresh/valid. (xref, provenance, freshness gates.)
- **Severity-laundering** — conserved-SUM gates that miss an equal-magnitude swap; need an L∞/max term or an identity veto. (energy gate, claim-cortex.)
- **Pre-sanitize-before-gate** — `Number(x)||0` upstream of a fail-closed check defeats it; thrown gate errors caught as accepts. (breaker, tick-core.)
- **Non-atomic / collision-unsafe writes** — read-modify-write without temp+rename or lock; overwrite of an existing dest; index written once after a loop → mid-loop crash orphans state; session-id collision. (energy-session state, memory-relocator.)
- **Path traversal / no containment** — env/config path strings returned raw; no abs-norm, workspace-containment, `..`/NUL rejection. (path-resolver.)
- **Closed-set forgery** — `Object.freeze(new Set)` still allows `.add()`; lexical tie-breaks game-able by suffix; comment/quote/case evading a closed-set membership test. (registries, supersession, PROTECTED_TYPES.)
- **Numeric overflow / non-finite leak** — aggregates emitting NaN/Infinity on extreme inputs with no post-aggregate finite check; canaries that only prove the uniform/trivial case. (math kernel.)

---

## 4. DISPATCH

Engine: `_SYSTEM/Scripts/codex-offload-runner.mjs` (model alias → `codex exec --model <id> --sandbox <mode> --cd <root>`).

- DRAFT (read-only, "Codex drafts → session lands"): `--sandbox read-only`, full tier `@gpt-5.5`. For enforcing-core / high-blast targets — Codex proposes a diff + evidence, the session reviews against live code, runs suites, then lands it. **Default for the live energy gate + breaker.**
- APPLY (workspace-write): `@gpt-5.5` / `@gpt-5.4-mini` default sandbox `workspace-write`. For lower-blast, owned files where direct edits are acceptable.
- SPARK (`@codex-spark`, gpt-5.3-codex-spark): bounded read-only second-opinion / verification lane.

Facade: `_SYSTEM/Scripts/ai @codex "<prompt-with-task-spec>"` (or `ai @codex-spark`). Large prompts → `/tmp/<task>.md` + reference.

Lane result must carry a conforming RESULT_LABEL (see `yuri-origin.md` → Lane Result Grammar).

---

## 5. AFTER A DISPATCH (session = verifier/finalizer)

1. Read the full Codex artifact dir / output — learn its working process, don't just take the verdict.
2. Re-verify every claim against local evidence (suites green, live behavior, RED→GREEN proof). Do NOT label work "Codex-verified" on Codex's say-so.
3. Continuity law on any change: graph → viz/engine → BUILD-MANUAL → re-verify → `ai reindex` (defer reindex under concurrent-lane / shared-DB pressure).
4. Owner gates the commit. Surface residual risk explicitly.
