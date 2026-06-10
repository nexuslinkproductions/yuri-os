---
name: moat-activation-4track-2026-06-03
description: "4-TRACK OP (ALL required, Marcel 2026-06-03 'none forgotten'): T1 energy→enforcing FIRST (in progress), T2 claim-evidence cortex, T3 MUSUBI ONE packaging spec, T4 subconscious --execute flip. Plus the CORRECTED dormancy backlog (map had phantoms)."
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - resume
    - continue
    - moat
    - energy enforcing
    - 4 track
    - claim cortex
    - subconscious flip
    - musubi packaging
    - openclaw install
    - write path portability
    - dormancy corrected
    - where we left off
  refs: 
    - "[[session-resume-2026-06-03-yuri-openclaw-codex]]"
    - "[[claim-evidence-ledger]]"
    - "[[yuri-musubi-naming-convention]]"
    - "[[neuro-tunables-map]]"
  originSessionId: 62cbcdd7-53e0-468e-aaa1-932bb064ad2e
---

GOAL: activate the YURI moat + ship YURI "MUSUBI ONE" (OpenClaw plugin). WHO: Marcel (owner, gates commits + all owner-terminal/approval steps); Claude main drives. WHEN: 2026-06-03. WHERE: energy core = `_SYSTEM/Scripts/math/yuri-energy.mjs` + `_SYSTEM/Scripts/energy-tick-core.mjs` + `_SYSTEM/SELF/energy-weights.json`; backlog source = `02_RESOURCES/RESEARCH/yuri-architecture-codex-2026-06-03.md` §6-8.

## 4 TRACKS — ALL REQUIRED, none may be dropped (Marcel directive 2026-06-03). Order: T1 first.
- **T1 ENERGY → ENFORCING — ✅ BUILT + TESTED + VERIFIED (2026-06-03), live in metrics-only burn-in.** Files: `_SYSTEM/Scripts/energy-breaker.mjs` (pure 3-state circuit-breaker CLOSED/OPEN/HALF_OPEN — cross-domain transfer from resilience4j, hardened against the "stuck" failure mode + a bug-bounty-found future-timestamp permanent-block bug) + `energy-breaker.test.mjs` (23/23) + `.claude/hooks/energy-enforce.mjs` (PreToolUse PEP, registered LAST in the chain) + `.claude/hooks/energy-tick.mjs` (outcome-driven transition added; core untouched, 21/21). Flags: `YURI_ENERGY_OBSERVABILITY=1` (master, already on) + `YURI_ENERGY_ENFORCE=1` (DEFAULT OFF — flip to enforce; off = METRICS_ONLY burn-in, audits would-denies to ~/.yuri-audit.log, blocks nothing). Override: `YURI_ENERGY_BREAKER_RESET=1`. Trips ONLY on catastrophic non-offsettable trailing verdict (protectedPathVeto η=100 / structuralFloorVeto θ=10); soft ΔU-ascent = advisory steer. Fail-OPEN everywhere (layer-2 under the deterministic operator-write-guard floor). 6/6 live smoke pass. OWNER GATE: the flip to enforce + (later) the CLAUDE.md "does not block" doc correction.
- **T2 CLAIM-EVIDENCE CORTEX — ✅ BUILT + 2-ROUND RED-TEAMED + 39/39 GREEN (2026-06-03, uncommitted).** Files: `_SYSTEM/Scripts/claim-cortex.mjs` + `claim-cortex.test.mjs`. `assessClaim(claim,{nowMs,weights})→{U,verdict,...}` (ASSERT/HEDGE/VERIFY-FIRST/RETRACT/EXPLORE) + `cortexSnapshot(claims)→{state,...}` emits the EXACT computeU field shape, lighting the 4 starved terms (α entropy, β KL, ε infoGain, ζ staleness) + θ inversions on real claim-work. Reuses canonical `PROMOTION_STATES` from claim-integrity-gate.mjs; native JS (interops with computeU's JS state — Rust doesn't fit this seam). Two adversarial Workflow red-team rounds found **17 fail-opens, all fixed+regressed**: timestamp manufacturing (future/unparseable/non-positive capturedAt, unbounded halfLife, non-finite + wrong-SCALE clock), recurrence-dedup bypass (key on `kind::reference` identity, not the attacker-controlled age bucket), convex (depth²) inversion penalty, clock-skew tolerance, null/throwing-getter denial-of-sensor. **C-RESIDUAL CLOSED (2026-06-03, no energy-core change):** the delta-gate equal-magnitude/Pythagorean swap is caught by `gateClaimTransition(before,after,opts)` — a cortex-layer gate that OR's a per-claim IDENTITY veto (reject any claim that becomes a new-or-deeper RETRACT, non-offsettable) with the untouched `gateProposal`. Identity is swap-immune where every magnitude aggregate (incl. L∞ max) is NOT. The owner-gated energy-core L∞ change is NO LONGER NEEDED. 46/46 green (incl. the exact swap + Pythagorean cases). Sensor still ADDITIVE/no-live-caller; `gateClaimTransition` is the gate-facing API a future hook calls. [[claim-evidence-ledger]] [[delta-gate-severity-laundering]]
- **T3 MUSUBI ONE PACKAGING SPEC (autonomous, no gate).** Lock naked-repo boundary (in/out, privacy/IP line) + corpus-curation criteria (sources, inclusion, license gate). EXCLUDE bug-bounty/hackerone signals + private vault + persona overlay. [[yuri-musubi-naming-convention]]
  - **OPENCLAW INSTALL-TIME WRITE-PATH PORTABILITY (Marcel 2026-06-04 — moat requirement).** YURI must install onto ANY OpenClaw user's workspace, so EVERY hardcoded write path must resolve through ONE configurable path layer (workspace-root + write-base) that **OpenClaw populates at install time** — not Marcel-machine paths baked into the shipped core. Surfaces to relocate: the Claude memory dir (`~/.claude/projects/<machine-id>/memory`), `_SYSTEM/state/*`, `_SYSTEM/OS_KERNEL/*.db` (search-index + memory), `_SYSTEM/SELF/energy-weights.json`, energy-session state, `~/.config/yuri/env.sh`, `~/.yuri-audit.log`, the new `circuitry-live.json` pulse file. Mechanism: a single path-resolver config (e.g. `yuri.config.json` / env workspace-root) that the OpenClaw bridge fills — it already reads OpenClaw config via `_resolve_openclaw_config_path`/`_load_openclaw_config`/`read_openclaw_skill_env` (`01_PROJECTS/openspace/openspace/host_detection/openclaw.py` + `_SYSTEM/OS_KERNEL/openclaw-bridge.sh`). **User-configurable setup at install = the integration surface** (let the user point YURI at their workspace). Acceptance: a fresh OpenClaw install writes ZERO files outside the user's configured workspace/home. Build under T3, not a separate track.
- **T4 SUBCONSCIOUS --execute FLIP — ✅ DONE (Marcel armed it 2026-06-03).** `export YURI_SUBCONSCIOUS_EXECUTE=1` appended to `~/.config/yuri/env.sh`, which the consolidator plist sources at run time (ProgramArguments line 19 — no plist edit / no launchctl reload needed). Gate verified: `kagami-memory-consolidator.mjs:203` reads `process.env.YURI_SUBCONSCIOUS_EXECUTE === '1'`. Forgetting loop now fires on the next scheduled 6am run (or `launchctl start com.yuri.kagami-memory-consolidator`). Disarm = delete the env.sh line. **TRACKS T1+T2+T4 DONE; T3 (packaging spec) is the only one left — PARKED until the math-theory research lands (Marcel: "hold t3 until research hits"), since it may sharpen the positioning/codename.**

## CORRECTED DORMANCY BACKLOG — the codex/anchor map had PHANTOMS (verified live 2026-06-03, 8-agent sweep). Do NOT re-chase these:
- **neuron-loop = ALREADY HEALTHY**, not "0 invocations". 41 runs May16–Jun3, last 06-03T10:02Z exit 0, twice daily, improvement_score=45. synthesis.jsonl live. NO action.
- **anime-DNA auto-fire = INTENTIONAL dead**, not a bug. Auto-fire deliberately retired in native-only Ph1-2; skills are model-invocable by design. Re-adding hooks would break the native-only contract.
- **lane-calibration feedback = MOOT.** overconfidence_gap computed but routing ignores it; the WHOLE offload apparatus is scheduled for native-only Phase-4 deletion. Wiring it would be retrograde.
- **offload-runner = ACTIVE**, not dormant (live dispatch errors prove it). Map was wrong.
- **dead energy terms (α entropy, β KL, ε infoGain, ζ staleness) = STARVED not broken.** `computeU` has all 9 wired with skip-guards; they go dark because routine tool traffic emits no claim/forecast/prior-posterior/halfLife structures. They light up when T2 (claim cortex) feeds them. ζ-via-halfLife backfill alone = gold-plating on an observability-only gate (skip).
- **global.md = HAS content** (mod Jun 1, not "empty since Apr 19"). Write-side IS unwired in session-reflect.js, but corrections arrays are currently EMPTY so wiring it now is a no-op pipe. pattern-promoter.mjs is the intended writer. Low priority until corrections flow.
- session-reflect dedup BUG = FIXED by Marcel (`3f2f68a2`); 22 spam SKILL.md swept.
- TODO(doc): correct the Architecture Codex §6 dormancy-register itself (neuron-loop, offload-runner, anime-DNA, dead-terms) so the committed doc stops misleading.

## METHOD DIRECTIVES (Marcel 2026-06-03, standing)
- Study the field/competition for mechanism-excellence before/while building (never copy). [[study-competition-for-code-excellence]]
- Cross-reference our LOCAL disclosed bug-bounty corpus (03_NEXUS-LINK/bug-bounty/corpus/bugbounty.db, 9487 reports) to harden code. [[bug-bounty-corpus-cross-ref-hardening]]
- Default to Rust where it fits (esp. shipped/perf/security engines); keep JS hooks/infra native. [[feedback-prefer-rust]]

## SECRETS REMEDIATION ✅ (2026-06-03, Marcel directive)
- Plaintext API keys were in BOTH `~/.config/yuri/env.sh` AND `~/.zshrc` (canonical; lines 47-83). Scrapped all except DEEPSEEK + NVIDIA (per directive); moved those to macOS keychain (`security` svc `yuri-deepseek-api-key` / `yuri-nvidia-api-key`, account=$USER). Both files now load via `$(security find-generic-password ... -w)` — zero plaintext. No rotation (owner said unneeded). KAGAMI_AUTH_TOKEN scrapped → KAGAMI_FACADE_ENABLED=0 (ai uses direct path; also fixes the `ai reindex` kagami perms error). env.sh chmod 600.
- BACKUPS still hold OLD plaintext (rollback net, chmod 600): `~/.config/yuri/env.sh.bak-2026-06-03` + `~/.zshrc.bak-2026-06-03`. OWNER: shred once a fresh shell is confirmed (`rm` them).
- .gitignore hardened: `_SYSTEM/state/energy-enforce.enabled` + `secrets.env` + `*.secrets`.

## STATE / NEXT
- COMMITTED+PUSHED: `bd936e6a` (forgotten OpenClaw docs) + `3371c378` (T1 energy-enforcing + guard hardening + persona-check fix). Both on origin/main.
- T1 ✅ DONE + LIVE: study-hardened (resilience4j) + bug-bounty-hardened. **ENFORCE IS ARMED** — flag file `_SYSTEM/state/energy-enforce.enabled` (gitignored, this machine) + `YURI_ENERGY_ENFORCE=1` persisted in ~/.zshrc:110. The energy gate now BLOCKS on catastrophic trailing veto (was observability-only). Reset: `YURI_ENERGY_BREAKER_RESET=1`. Disarm: rm the flag file.
- Fixed pre-existing blocker: `yuri-persona-check.mjs` crashed on deleted `_SYSTEM/CODEX_PROTOCOL.md` → was aborting ALL commits. Removed the dead refs.
- NEXT (all required, Marcel "none forgotten"): ~~T2 claim-cortex~~ ✅ DONE (2-round red-teamed, uncommitted) → T3 packaging + Rust-core-engine eval + secrets-exclusion in privacy/IP line → doc-truth (Architecture Codex §6 phantoms + CLAUDE.md "does not block" line now needs nuance: blocks when enforced) → owner-terminal guard hardenings (bash-guard pattern gaps, yuri-operator chmod/argv, protocol-guard /tmp UID — see [[bug-bounty-corpus-cross-ref-hardening]] + `02_RESOURCES/RESEARCH/yuri-guard-surface-hardening-2026-06-03.md`).
- ~~OWNER DECISION PENDING (L∞ energy-core fix)~~ ✅ MOOT — closed cortex-side via `gateClaimTransition`, enforcing core never touched.
- **PARALLEL QUEUE (Marcel 2026-06-03, this session):**
  - (A) BRAIN-DUMP DECODER rebuild — owner chose "both, phased": spec-fuse FIRST, then wire to a real mechanism. **ATTACK DONE** (6-archetype empirical red-team, 49 failures → taxonomy at `/private/tmp/.../tasks/w0jompqhe.output`). Top CRITICAL gaps: (1) NO intent layer (Haki-blind — decodes surface tokens, misses the real P4/P5 ask); (2) NO five-state router fusion (pivots/kills land as peers of live work, no ACTIVE/EVIDENCE/IMPL/PARKED/REJECTED). HIGH: emotional-voltage flattened, no memory/parked-branch recall, no claim/evidence separation. **PHASE 1 SPEC DONE** — `02_RESOURCES/RESEARCH/04-BRAIN-DUMP-DECODER.md` reworked in place into the v2 12-stage pipeline (triage→Haki intent→recall→nodes→five-state routing→epistemic tagging→cross-domain→felt-core→goal-spine priority→blind-spots→self-check→forced next-move), Marcel-tuned, all 13 failure classes covered. **PHASE 2 ✅ DONE + COMMITTED (`a8ee4310`):** the 8-step pipeline is now fused natively into `_SYSTEM/persona.md`'s "Decode, don't interrogate" rule (always-on, threads the existing five-state router, points to the 04 spec). Decoder rebuild COMPLETE both phases. Optional Phase-3 (executable wiring Stage-5 claims → claim-cortex.mjs) deferred — not requested. All 3 session commits on origin/main: `52ee7488` cortex · `9ce04deb` decoder-spec+dflash · `a8ee4310` persona-fusion.
  - (B) DFLASH study — ✅ DONE, verdict **PARK** (not a build). It's a block-diffusion speculative-decode DRAFT model on MLX; value is in trained draft WEIGHTS we can't cheaply reproduce, no Rust seam, no YURI consumer (our local path is ollama/llama.cpp, not MLX). Re-eval only if z-lab ships the training recipe AND we stand up an MLX local lane (`gpt-oss-local-runtime` is the host). Report: `02_RESOURCES/research/dflash-viability-2026-06-03.md` (reindexed).
- **CAPSTONE (after all T's, Marcel directive):** deep + precisely-coordinated RED-TEAM ATTACK on YURI — the CODE, not just the surface. Logic flaws, invariant violations, races, the energy math, memory governance, the breaker itself. Aggressive as possible → find what we missed → fix + harden. Use [[feedback-adversarial-persona-attack-loop]] + [[feedback-substrate-cert-loop]] discipline.

SEE: [[session-resume-2026-06-03-yuri-openclaw-codex]] · [[claim-evidence-ledger]] · [[yuri-musubi-naming-convention]] · [[neuro-tunables-map]]
