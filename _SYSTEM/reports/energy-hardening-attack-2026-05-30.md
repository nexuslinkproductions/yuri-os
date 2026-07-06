# Energy Gate — Adversarial Hardening Attack (2026-05-30)

**Method:** 21 persona-loaded Opus agents, 7 attack fronts, refute-by-default, every critical/high bug independently re-verified (12/13 confirmed real). Full raw output: workflow `wkzq6dn4k`.

## Honest operational verdict
**Real as TELEMETRY, overclaimed as a GATE.** The everyday-ΔU loop is genuinely firing (live snapshot climbed to depth 234 against real tool calls; records honestly provenanced; not seeded; tests green; protected-path catastrophe fires on the live path). BUT:
1. It **observes at PostToolUse — it does not BLOCK.** The `enforce` field is written by config+server and **read by nothing** (0 consumers).
2. The live path is a **3-of-9-term if/else heuristic** wearing Lyapunov vocabulary — `toGateState` never feeds KL/entropy/infoGain/staleness, so 4 of 9 weighted terms never fire in production.
3. `YURI_ENERGY_OBSERVABILITY=1` is **not in settings.json** — only an ambient shell export. A clean `claude` session runs the hook to a **silent no-op**.

## Verified-real bugs (act on these)
| # | Sev | Bug | Fix |
|---|---|---|---|
| 1 | **CRIT** | `resolveRole()` FAILS OPEN: `{}`/corrupt/zero-byte/missing-salt cred → `dev` (docstring promised fail-closed). | Split absent (→dev, setup) from present-but-unparseable (→coworker, tamper). |
| 2 | **CRIT** | `dev-credential.json` not protected from Write/Edit tools — `Write '{}'` passes all 3 PreToolUse guards; chained with #1 = one-write self-escalation to dev. | Tool-agnostic PreToolUse file guard on cred + guard files for coworker. |
| 3 | HIGH | KL drift penalty **non-monotonic** — `verified=[0,1]` (provable lie) → `klDivergence` throws infinite → skipped → ΔU=0 → **ACCEPT** the worst case. | Clamp verified probs ≥ε before KL (mirror logLoss clamp). |
| 4 | HIGH | Masking **veto fix lives only in the simulator**, not live `gateProposal` — live gate still maskable (ve=1000 → accept). | Move veto INTO `gateProposal`: any protected-path increase ⇒ reject, non-offsettable, regardless of ΔU/override. |
| 5 | HIGH | **Privacy KEY-smuggle**: a secret as a KEY in `claimPromotionDistribution` lands verbatim in the on-disk JSONL — `validateRecord` gates VALUES by path, never KEYS. | Project distribution keys onto the canonical label set in `summarizeState`; validate keys/charset. |
| 6 | HIGH | **Repeated-failure plateau**: logLoss/brier are MEANS → fail #2–5 add ΔU=0 (gate stops penalizing repeated confidently-wrong). | Per-event incremental/count penalty, not a windowed mean. |
| 7 | HIGH | **ZERO control-plane registration** — 7 new components unregistered; `artifact-registry --validate` returns false all-clear over the gap (the exact silent slip-past). | Register all; add coverage validator; wire liveness probe + test gate. |

## Control-plane gaps ("bake it in so nothing slips")
- `artifact-registry.json`: register energy-tick(.mjs/core), yuri-energy-config, yuri-energy-simulate, yuri-control-server, user-roster/auth, cockpit HTML.
- `context-registry.json`: add an `energy-control-plane` packet (router surfaces nothing today).
- `INDEX.md` Read-First: add energy-tick-core, yuri-energy, yuri-control-server.
- `yuri-supercharge-gate.mjs`: add the new `.test.mjs` files (they run nowhere automated).
- `yuri-health.mjs`: add an observability **liveness probe** (switch-on ⇒ today's trace has ≥1 record from this session, else DEGRADED).
- `.gitignore`: add `_SYSTEM/state/energy-config-changes.jsonl` (NOT-ignored — /apply audit log committable); decide `energy-weights.json`; move to `_SYSTEM/state/**` deny-by-default.
- Harden `artifact-registry --validate` to fail on unregistered git-tracked durable artifacts.

## Hardening plan (beyond the bugs)
- Put `YURI_ENERGY_OBSERVABILITY=1` in settings.json env (version-controlled), not an ambient export — else the headline feature is dead by default.
- Bound U below: `verifiedEvidenceCredit` is unbounded linear → no infimum → "descent"/Lyapunov claim is vacuous + buys arbitrary masking budget. Saturate (e.g. `-iota·log(1+count)`).
- Add the adversarial regression tests (the suites codify only the happy path): maximal-KL⇒reject, protected⇒reject regardless of evidence/override, Nth failure still raises U, secret-key dropped, corrupt-cred⇒coworker.
- `yuri-control-server`: bearer token + Origin/Host check on /apply,/reset (any local process can rewrite live weights today if started by a dev shell).
- Wire `enforce` into a real decision or delete it + its dial (a control that does nothing is false control).

## The big question — does it solve a real AI-industry problem?
**Real problem, legitimate reframe, overclaimed execution.** (solvesRealProblem: true.)
- **Steelman:** static (what an agent may touch) vs **dynamical** containment (how control-plane state MOVES) is a real, crisp, original distinction; a scalar potential U over control-plane META-state (not NN weights) is a legitimate level-shift the EBM literature doesn't occupy; agent reliability (stopping silent advance of unverified claims) is a real, unsolved, money-burning problem; an auditable per-transition energy/salience signal is useful even as pure telemetry. Math primitives textbook-correct.
- **Skeptic:** the "gap" is defined against ICM/MWP (arXiv:2603.16021) which the registry admits is **not in repo**, is a future-dated preprint by Marcel's own outreach target, not an established ML object → a reviewer rejects the premise. No engagement of adjacent prior art (runtime verification, shielded RL, control-barrier/Lyapunov functions, calibration-gated promotion). "Lyapunov" is decorative — no update map, no boundedness proof (U unbounded below). Live path is 3-of-9 if/else; observes not blocks; the "untested" evasion is trivially live.
- **Honest verdict:** publishable IF reframed as *"an auditable energy-style salience signal for agent transitions"* (telemetry — what it is), NOT *"a Lyapunov gate that blocks invalid transitions"* (the wiring doesn't). Position against runtime-monitoring / shielded-RL / Lyapunov-control prior art, not one unverifiable preprint. Reconcile 6-vs-9 terms, bound U, earn or drop "Lyapunov."

## Remediation order (per the lead reviewer)
1. **Security criticals first** (#1, #2) + the no-op switch.
2. Control-plane registration + liveness + test-gate coverage (#7).
3. Math/honesty cleanup (#3, #4, #5, #6) + bound U.
4. Paper reframe (telemetry-not-gate, prior-art citations) before any external review.
