# 03 — QUANTUM-SIM + RED-TEAM (Phase 2 verdict)

> Simulation + adversarial-verification record for the 6 greenlit designs. Source: `wf_99cbe42d-a34` synthesis (`plan-synthesis` agent) + 6 independent red-team agents. Pairs with `02-ADOPTION-BLUEPRINTS.md`.

## QUANTUM SIM — build-order non-commutativity

**Method:** ran `quantum-hypothesis-tracker.mjs` programmatically (it's a library, no CLI) — 7-dim Hilbert space (6 items + 1 shared-substrate axis = capabilities.json regen / skill-hash registry / closed schemas, the only file-contention surface). Each build = a diagonal projector keeping its own axis + the shared axis it mutates. Measured `measureSequential` + `qqEquality`.

**Verdict (honest, no manufactured effect):** the build order is **NOT quantum-non-commuting.** Security→CCR jointProb == CCR→Security jointProb (0.142857, equal to 1e-9); QQ-statistic = 0.000000 for cost-vs-human and firmware-vs-human pairs. Diagonal projectors commute → items do not interfere as hypotheses.

**The real coupling is CLASSICAL file-collision**, not order-effect physics: multiple items regenerate `capabilities.json`, edit closed schemas, touch the skill-hash registry. That's a serialization/atomic-staging concern. So ordering is driven by **dependency + buildReadiness + commercial urgency + protected-file blast radius** — not interference. The sim's value: it *proved* the contention commutes and *refused to fabricate* an order-effect where the math shows none (consistent with the tracker's no-spurious-win-on-order-free-control gate).

**Dependency graph:** a flat fan (all roots, no correctness chain) + a per-commit serialization gate. The only "dependency" surfaced (cost-admission "reuse token-ledger math") was a red-team-caught FALSE claim → it's a self-contained additive export inside cost-admission's own build, not a cross-item edge.

## CROSS-CUTTING RISKS (7 — carry into BUILD)

1. **Pre-commit `capabilities.json` contention** — 4/6 items regen it (live count=30); `pre-commit:29` `capability-scan --check` exit(1)s on disk-vs-scan drift. Each item MUST `capability-scan.mjs` (regenerate, never hand-edit) and stage **atomically in its own commit** — never a shared "regen later" step (the recurring `REF:COMMIT-GATE-RECONCILE` disease).
2. **Skill-hash drift gate** — ccr (edits compact-optimizer SKILL.md, hash `b7904322`) + human-review (adds plan-review SKILL.md) both trip `yuri-skill-loader --validate` (`pre-commit:26`, exit(1) on drift>0). Both filePlans **omit the `--write-manifest` reconcile step** → commit blocks until added.
3. **Invalid RESULT_LABEL in 2 items** — ccr (`04CP_..._X_PASS`) + human-review (`09PR_..._X_PASS`) FAIL `parseResultLabel` (KNOWN_TERMINALS = `PASS_COMMITTED|COMMITTED|BLOCKED|REPAIR_REQUIRED`; bare `_PASS` is not terminal). Use `_X_PASS_COMMITTED`/`_F_BLOCKED`, BARE label (no `RESULT_LABEL:` prefix → mis-parses).
4. **Secret-leak-scan on test fixtures** — skill-security + ccr + human-review add token/key/JWT-shaped fixtures; `pre-commit:11` scans the whole tree. Fixtures must avoid real-prefix tokens (`sk-`/`AKIA`/`AIza`/`ghp_`/`nvapi-`) → use `process.env` reads or benign-marked values.
5. **False "reuse" / capability-first violations under build pressure** — cost-admission's "reuse token-ledger exported math" is FALSE (verified file-private → must export, not duplicate, or break currency-parity); staleness's `heuristicEdge` duplicates the existing `queryInvariant` flag. Anti-duplication tests must be MANDATORY, not advisory.
6. **Phantom / forward-wired code sold in present tense** — cost-admission R3 reacquire has ZERO live callers (no `--tools` local lane exists); staleness `heuristicEdge` has ZERO live consumers; human-review HITL is advisory-only (`emitWarnings`, not `emitBlock`). All three must be **reframed as forward-wiring, not claimed as live fixes** — else commercial-readiness is overstated.
7. **Clean-room integrity rests on attestation only** (sources not re-read this phase per no-clone) — standard for the mission, but no diff-against-source check exists. The hand-rolled JS/TS tokenizer (skill-security) is the **single highest correctness risk** and the most likely to drift toward upstream expression under build pressure → guard it.

## OWNER DECISIONS REQUIRED (block specific builds)

| Decision | Blocks | Options |
|----------|--------|---------|
| Real **budget cap value** + window semantics + free-lane USD exemption + over-estimate multiplier | cost-admission **arming** | needs a real number Marcel sets; build can land DISARMED first |
| HITL **F-verdict: hard-block vs advisory** + is there a real human at the PTY | human-review **behavior** | hard-block = real R4 enterprise guarantee but fights continuous-PTY autonomy; advisory = pacing only |
| Staleness scope: **committed-drift vs working-tree** | staleness default | committed-only (recommended — dirty tree has 220 files) vs working-tree opt-in |
| `design-principles.md` **dual copy**: collapse+symlink vs keep byte-identical | firmware-policy (non-blocking) | orphan `.claude/skills/` copy is unreferenced |
| ccr **TTL default** (continuity vs disk) + provider-agnostic vs provider-aware cache detection (R1) | ccr design | — |

## NET VERDICT

Pack is **build-ready in sequence, not as one batch.** 1 ready-to-build (skill-security, with locked hardening contract); 1 safe-to-build-now (firmware-policy, docs only, after 4 corrections); 4 need design corrections, 2 of those also owner-blocked on real decisions. **Recommended first build: firmware-policy** (zero executable/gate/hash collision, codifies the verification-as-infra-moat + prompt-as-firmware strategic wins, de-risks every later item). Then skill-security under owner gate (launch table-stakes). Do NOT arm cost-admission or hard-block human-review without the owner decisions above.
