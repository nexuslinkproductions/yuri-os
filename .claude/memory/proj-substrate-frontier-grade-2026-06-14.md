---
name: proj-substrate-frontier-grade-2026-06-14
description: "Standing nano-swarm mission — harden YURI's cognitive-gate substrate to frontier-lab grade (chip-verification + AI-lab eval transfer); Stage 0-2 done, Candidate A (computeU ∀-input invariant prover) SHIPPED+VERIFIED, owner-gated keystone E pending"
metadata: 
  node_type: memory
  type: project
  tier: 2
  scope: substrate (energy gate / claim cortex / calibration / circuitry)
  trig: 
    - substrate
    - energy gate
    - frontier
    - invariant
    - computeU
    - wiring
    - identity veto
    - nano swarm
  refs: 
    - proj-energy-calibration-swarm-sheet-2026-06-13
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

GOAL: Marcel's standing directive (2026-06-14) — I am the nano-swarm agent over the cognitive-gate substrate; drive its integrity/validity/security/wiring/mechanisms to frontier-lab grade via cross-domain transfer (how chip shops + frontier AI labs engineer correctness/reliability/scale → YURI). "Go all out": online deep research + own swarm. Multi-session, resumed via the master brief.

WHO: Marcel (owner, gates all gate-core changes). Lanes used: 6 research + 1 capability audit (sonnet Agents) + Mimo + DeepSeek (blinded peer cross-family verify).

WHEN: opened 2026-06-14. Ongoing.

WHERE: 02_RESOURCES/RESEARCH/substrate-frontier-grade-2026-06-14/ — 00-MASTER-BRIEF.md (anchor + status log) + 01-research-synthesis.md (transfer map A–N, ranked).

STATE: Stage 0-2 DONE. 12-candidate transfer map (A–L) + 2 peer-added (M shadow-mode differential deploy + auto-rollback; N operator-labeled ground-truth corpus). Three-way blinded convergence: **A unanimous top-2** (me/Mimo #1, DeepSeek #2). Both peers flag heaviest gate-core items overrated → DEFER L + J. **Candidate A SHIPPED+VERIFIED**: `_SYSTEM/Scripts/math/yuri-energy-invariants.mjs` — ∀-input property prover for computeU (9 invariants: reconstruction/finiteness/3×monotonicity/sign-convention/U-floor/barrier-dominance/weight-isolation) with planted-mutant negative controls (RED-GREEN, non-vacuous). 9/9 hold over 72k checks; 4/4 mutants caught; 51 tests green; registered in MATH-SCIENCE-MANUAL.md. Incidental: computeU fail-closes on negative weights. enforce DISARMED; NOTHING committed (uncommitted v3+μ diff also still sitting — do not tangle).

KEYSTONE (owner-gated): the per-claim non-offsettable identity veto (`gateClaimTransition`, claim-cortex.mjs) is BUILT+TESTED but TEST-ONLY — no live enforcement reader (confirmed on HEAD by R6 + L1). DeepSeek ranked wiring it (E) the #1 single action. Observe-mode adapter first; owner arms the block.

UPDATE 2026-06-14: owner chose "both: E first, then Tier-1". **E SHIPPED+VERIFIED**: `_SYSTEM/Scripts/claim-transition-observer.mjs` — gives `gateClaimTransition` (the swap-immune identity veto, previously NO runtime caller) its first live caller, wired ADVISORY into the already-registered `prose-claim-extract` PostToolUse hook (the v2 prose-claim seam its docblock named; NOT the v1 fixture tick ledger where it'd be dead code). Observe-only (caps disabled), never blocks, hook exit-0/fail-open preserved, RETRACT-gated. Proven: fake over-claim write → veto fires advisory (2 claims 0→5) + JSONL trace at `_SYSTEM/state/claim-transition-trace.jsonl`. 75 tests green. Arming the block = owner's separate step.

D SHIPPED+VERIFIED (2026-06-14): `_SYSTEM/Scripts/math/yuri-energy-coverage.mjs` — covergroup coverage meter for computeU; caught+fixed its OWN false-hole denominator bug pre-ship (3 always-emitted keys can't be 'absent'); finding: random gen hits only ~40% of reachable bins = coverage-closure worklist. 671 tests green (full math+cortex+observer sweep).

3 instruments shipped + verified this session (A invariant-prover, E identity-veto observe-wiring, D coverage-meter), all observe-mode/reversible/UNCOMMITTED, enforce DISARMED. New files: math/yuri-energy-invariants.{mjs,test.mjs}, math/yuri-energy-coverage.{mjs,test.mjs}, claim-transition-observer.{mjs,test.mjs}; edited: MATH-SCIENCE-MANUAL.md (2 registrations), .claude/hooks/prose-claim-extract.mjs (E wiring).

UPDATE 2026-06-14b: owner approved commit+push + said let DeepSeek/Mimo BUILD as peers (max reasoning) + red-team EVERYTHING after all waves. COMMIT staged clean (A+E+D, 11 files, explicit pathspec) but BLOCKED by a pre-existing protected-path stray `_SYSTEM/Scripts/math/.claude/state/session-checkpoint.json` tripping the repo-wide root-arch pre-commit gate — Claude is guard-barred from touching `.claude/state/`; OWNER clears via `rm -rf "_SYSTEM/Scripts/math/.claude"` or `--no-verify`. Root cause = `.claude/hooks/session-checkpoint.js` writes cwd-relative state path (substrate follow-up).

PEER BUILDS: **I (Mimo) SHIPPED+VERIFIED** — `_SYSTEM/Scripts/math/yuri-energy-contracts.mjs` DbC layer (C1–C6 postconditions + W-* preconditions), 24/24 green, standalone, registered. **C (DeepSeek) DEFERRED** — good LEC/DRT scaffold but property BARRIER-CONFOUNDED (eta=100 swamps β·W₁; sign-flip control likely uncaught); v2/v3 intentionally non-equivalent on drift → needs drift-isolating generator + agree-on-clear + intended-divergence property. Raw at /tmp/ds-build-C.out, not on disk.

VERIFIED TALLY: A,E,D,I (4 instruments). NEXT: clear commit blocker → push A+E+D+I → refine C → build G (contamination seal) + B (metamorphic campaign) → RED-TEAM EVERYTHING (owner directive) → owner decisions arm-E/H/M/N. Defer L+J. Peer-build→verify→ship loop proven (Mimo I); peer output is advisory-until-Claude-verifies (DeepSeek C caught pre-ship).

SEE: [[proj-energy-calibration-swarm-sheet-2026-06-13]]
