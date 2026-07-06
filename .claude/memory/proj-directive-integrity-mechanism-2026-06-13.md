---
name: proj-directive-integrity-mechanism-2026-06-13
description: "Directive-integrity mechanism — YURI's third gate (directives); root cause was Track B index/body inversion (the 'dead brain-inject parser' was a misdiagnosis, retracted); L1 linter built, enforcement gated observe-only"
metadata:
  node_type: memory
  type: project
  tier: hot
  scope: project
  trig:
    - directive integrity
    - memory drift
    - index body drift
    - standing directive
    - directive guard
    - coherence lint
    - third gate
  refs:
    - feedback-mimo-peer-lane
    - ref-mimo-firing
    - feedback-two-track-rule
  originSessionId: 27e6476f-energy-calibration
---

GOAL: prevent the failure class where a known standing directive is silently violated because the always-loaded MEMORY.md index hook drifts from / contradicts / fails to surface the source-file body. Frame it as YURI's THIRD gate: actions are gated (energy gate), claims are gated (claim cortex), directives were ungated — this closes that.

WHO: co-designed by the Claude lane + the Mimo lane as peers (the directive that was violated was "Mimo is a peer", so the fix was designed WITH Mimo).

WHEN: 2026-06-13 (Mimo-peer correction incident this session).

WHERE: design + integration report `_SYSTEM/reports/directive-integrity-mechanism-2026-06-13.md`; built layer-1 detector `_SYSTEM/Scripts/memory-coherence-lint.mjs` (read-only, deterministic, run-verified). Mimo memo archived at /tmp (peer design: 7 failure modes F1-F7, 5 mechanisms M1-M5, tiered enforcement, P1-P8/N1-N7 sim battery).

ROOT CAUSE (verified): BUG-1 (the only real bug) — Track B index/body inversion: directive body (`.claude/memory/ref-mimo-integration.md`) updated to "peer/equal" 2026-06-10 but its `.claude/memory/MEMORY.md` index hook still said "NOT a replacement"; the always-loaded summary inverts the rule. The stale hook reached context via the HARNESS claudeMd/memory dump of Track B. BUG-2 (claimed: brain-inject dead parser) was RETRACTED — brain-inject reads `_SYSTEM/memory/MEMORY.md` (Track A), which IS still the table its parser expects (parses ~10 rows fine). I almost shipped a regression "fixing" it before hexdumping the file; reverted. Two separate indexes exist: Track A (table, brain-inject) + Track B (list, harness). The near-miss is itself the failure class (unverified claim about code) — see report lesson 5.

MECHANISM (synthesis): L1 coherence linter (detect F1/F2, BUILT) + L2 PreToolUse directive-guard reading an `enforce:` frontmatter block (surface F3 / deterministic check F4) + L3 correction→promotion handler (F5/F6) + audit (F7). Divergence from Mimo's M5: keep rich index hooks + linter for the ~190 regular memories; the M5 contract (`enforce:` block) is scoped ONLY to the ~10 behavioral directives. Posture: observe-before-enforce (inject-only → burn-in → measure false-positive → arm binding), mirroring the energy gate's `energy-enforce.enabled` flag.

SIM (real, live store, 205 files): 2 hard defects (no-description) + 7 orphan rules (exist, never surfaced) + 1 stale contradicting hook (PROJ:ENERGY-GATE-LINFINITY says "inert" / body says "RESOLVED"). Drift is systemic (~9 live defects). Validates L1 empirically. L2/L3 enforcement battery designed, runs once the guard exists in observe mode.

STATE: SHIPPED observe-only. L1 linter built+run (memory-coherence-lint.mjs). L2 directive-guard BUILT (Mimo co-authored core + tests, 11/11 pass, 6/6 manual scenarios) and WIRED into .claude/settings.json PreToolUse (last in group 0, after energy-enforce). 3 directives live in .claude/directives/: mimo-peer-no-cap, no-anthropic-headless, no-commit-without-approval. OBSERVE-ONLY locked (surfaces rule as additionalContext + logs would_warn to ~/.yuri-audit.log; NEVER denies). claude-p exemption (Marcel 2026-06-13): the no-claude-p ban is ANTHROPIC-lane-only; Mimo via wrapper/mimo.mjs is exempt — encoded in no-anthropic-headless.md via a negative-lookahead constraint, verified. L3 correction→promotion deferred (moot under observe-only). No brain-inject change (BUG-2 retracted). Disable: remove the directive-guard.mjs line from settings.json PreToolUse.

NEXT: owner decisions — (1) arm binding enforcement or stay observe-only; (2) which directives get `enforce:` blocks; (3) build with Mimo as co-equal lane (proposed: Mimo owns the PreToolUse guard + correction handler, Claude owns L1 wiring + brain-inject fix). Quick wins the linter already surfaced: fix 2 no-description + the stale ENERGY-LINFINITY hook + triage 7 orphan rules.

SEE: [[feedback-mimo-peer-lane]] · [[ref-mimo-firing]]
