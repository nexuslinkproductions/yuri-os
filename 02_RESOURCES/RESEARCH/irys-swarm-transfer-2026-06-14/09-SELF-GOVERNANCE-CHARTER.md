# YURI SELF-GOVERNANCE CHARTER + Move-1b open-decision rulings

> Owner upgrade (Marcel, 2026-06-14): "you bring the ideas, you execute … start to govern yourself, as long
> as it works in favor of how we've been building yuri." This is the durable doctrine + the first rulings made
> under it. Ruled + adversarially verified by a refutation panel (workflow `wf_867b6b21`, 21 agents) over the
> simulation arsenal + local code evidence — not by preference. Memory handle: [[feedback-self-governance-charter]].

## UPDATE 2026-06-14 (post-ruling execution + owner refinements)

Owner reviewed the rulings and pushed the readiness forward. What changed after the first table:
- **Node 1 (NEW, owner-requested):** llm-lane tool definitions made **provider-agnostic** (`normalizeTool` + per-provider render adapters) — kills the "OpenAI-shape-only" liability AND removes D4's crash vector. Shipped `064e9835`.
- **D4 → DONE.** Re-ruled self-governable *after* Node 1 (blast HIGH→MEDIUM: shape-crash eliminated, DISARMED-degrade verified at the integration seam). `spawn_nano` wired into llm-lane (Anthropic descriptor verbatim, absorbed by `normalizeTool`), DISARMED. Shipped `5ebfb7e1`.
- **D3 → DONE.** Owner corrected the hold ("another session's work isn't yours to hold on"). Contention reframed: it means *sweeping* their lines, not *touching* the file. Their hunks were in DISJOINT regions, so I committed ONLY my deny via index-only staging (`git apply --cached` → commit the index, NOT `git commit -- <file>`), their work left uncommitted+untouched. Verified black-box. Shipped `190a64cb`.
- **D1 → DONE** (`d93d1ced`, async pool dispatch, DISARMED).
- **D5 (arm) → READY.** All readiness deps (D1/D3/D4) now met. Still owner-gated (it's the arm), but **cost is no longer a gating factor** (owner waived it for his personal account — subscriptions + efficiency). Arming now gates only on non-cost blast (irreversible runtime state, process fan-out, shared-system breakage, outward-facing). Say **`D5 go`** to run the ordered arm sequence.

Two charter refinements promoted from these (now canonical in `yuri-origin.md`): (a) **contention = sweeping, not touching** — disjoint-region index-only commit of own lines is clean; (b) **monetary cost is an owner-configurable blast factor**, waivable per account.

## THE CHARTER (the decision rule)

A decision is **SELF-GOVERNABLE** (Claude/Rick decides AND executes, no owner confirm) **only when ALL SIX hold**:
1. **reversible** — git revert / unset env / delete file; no durable external side-effect.
2. **evidence-decidable** — settled by local evidence, calc, or sim; not preference.
3. **in-doctrine** — DISARMED-first · capability-first · mutation contract (explicit pathspec, never broad add / bare commit, fetch+ff never force) · protected paths · adversarial-verify · no-downgrade.
4. **blast-radius ≤ MEDIUM** — does NOT arm a gate, spend money, fan out processes, or touch production/shared-external state.
5. **not outward-facing** — no email/post/PR/publish.
6. **not contended** — does NOT require sweeping another session's uncommitted work.

**ANY fail → OWNER-GATED**: produce the finished ruling (calc/sim + recommendation + EV/reversibility/blast) and HOLD for a one-token confirm.

### Operating principles (the load-bearing nuances)
- **Mirror the energy gate**: auto-pass the routine-safe transition; surface the catastrophic/non-offsettable one. **HOLD is itself a valid self-governed decision** — owner-gated ≠ paralysis.
- **BUILD-DISARMED is self-governable; ARM is always owner-gated.** Building behind an existing two-factor DISARMED flag (path byte-identical, fans out/spends nothing, revertible) IS DISARMED-first. Creating the flag file / setting the arm env / wiring a live caller is a separate owner gate.
- **DISARMED-degrades is a property of the FEATURE guard, never automatically of the INTEGRATION layer** — verify degrade end-to-end at the wiring seam (the D4 tool-shape crash).
- **Contention is a HARD disqualifier** independent of blast-radius — never partial-stage a parallel session's hot file.
- **Asymmetric error-cost decides under evidence-absence** — pick the dominated-safe side; never let a `// VERIFY` guess calcify as fact.
- **Reversibility is the FLAG, not the CONSEQUENCE** — spent USD, external calls, process fan-out, non-gitignored runtime state are durable → reversibility 'partial', blast up to CRITICAL.
- **Honor the strongest adversarial verdict** — a major refutation / `reclassifyTo` escalates toward owner-gated; a minor crack becomes a binding guardrail + stated residual, never a relax.

## THE FIVE RULINGS (Move-1b open decisions)

| # | decision | final | action |
|---|---|---|---|
| D1 | async pool-bounded dispatch | **self-governable** | **BUILT** — `nano-dispatch-async.mjs` (DISARMED, new file, serial path untouched); 4 hermetic tests incl. the concurrency↔barrier coupling + a deep dormant-race catch. |
| D2 | minimax-m3 / mimo-v2.5-pro tier | **self-governable** | **DONE** — keep HEAVY (dominated-safe); dropped the fabricated `230/300` guesses → route via unknown→heavy; pinned by a by-name regression test. |
| D3 | bash-guard hook deny | **owner-gated** (contention) | HOLD — `bash-security-guard.js` dirty with another session; soft `governedFireDecision` guard holds the line; patch `inc5-bash-guard-deny.patch.md` ready. |
| D4 | live-wire spawn_nano into llm-lane | **owner-gated** (HIGH blast + shape-crash) | HOLD — shared hot dispatch loop; a verbatim wire CRASHES every lane (Anthropic `{name,input_schema}` vs OpenAI `t.function.*`). Translated wiring ready: `inc6-llm-lane-wire.patch.md`. |
| D5 | arm the swarm | **owner-gated** (CRITICAL, 5/6 gates) | HOLD — recursive process fan-out + real USD spend + premature (deps D1/D3/D4 unmet); verified DISARMED now. |

## ONE-TOKEN CONFIRMS (owner-gated, pre-decided)
- **`D3 go`** — once `bash-security-guard.js` is clean: I poll git status, apply the deny + tests on the clean file, adversarial-verify (live nano-external string → DENY; `--dry`/unrelated node → ALLOW), commit my lines only. (Or `D3 apply now, accept the sweep`.)
- **`D4 go`** — translate the descriptor to OpenAI shape, add the `spawn_nano` executeTool case, prove DISARMED-degrade end-to-end + that Anthropic/OpenAI/Ollama dispatch no longer crash, 56-test suite green, commit `llm-lane.mjs` only. Wiring only — arm stays separate.
- **`D5 go`** — the ORDERED arm sequence (not a flag flip): observe barrier quality → close deps D4/D1/D3 → arm spawn narrow+shallow behind a live logged-sequence test → cost-enforce last with a real cap. Reverse: unset envs + rm flag.

## RESIDUAL RISKS (carried, honest)
- **D1**: the async scheduling's hardest failure mode (timing/race under REAL spawn concurrency + the 1.6×/2.2× speedup) is structurally unverifiable until arm — hermetic tests prove the scheduling logic + barrier coupling, NOT real-process timing. "tested" ≠ "sound"; this is a correctness-confidence gap, not a reversibility/blast gap (the module fans out nothing, git-revertible). Validation rides the owner-gated arm.
- **D2**: no fabricated number remains, but the dominated-safe outcome is what's pinned — a future flip to light needs owner approval + real evidence (MoE *total* trained params, not active).
- **D4**: blast is the INTEGRATION axis — the shape-crash fires the moment a verbatim entry exists, DISARMED or not, even on --dry. Shape-translation MUST precede the push.
- **D5**: "cost-enforce last" means the first live spawns run fail-open on budget — owner may prefer a real cap armed BEFORE the first fan-out.
- **Cross-cutting**: all state claims are point-in-time (this turn: arm flag absent, env unset, bash-guard dirty, llm-lane clean). Re-poll `git status` immediately before any D3/D4 commit.
