---
name: session-resume-2026-06-03-cortex-decoder-circuitry
description: "SPOTLESS RESUME (2026-06-03 EOT): cortex+decoder+research SHIPPED; moat T1/T2/T4 done, T3 next. NEXT-SESSION ORDER (Marcel): spec T3 → B build a research transfer → A rework the yuri-os-dashboard into a live circuitry visual."
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - resume
    - continue
    - where we left off
    - next session
    - t3
    - circuitry
    - dashboard
    - visual
    - research catalog
    - spec t3
  refs: 
    - "[[moat-activation-4track-2026-06-03]]"
    - "[[delta-gate-severity-laundering]]"
    - "[[claim-evidence-ledger]]"
    - "[[yuri-musubi-naming-convention]]"
  originSessionId: 7c5d16a8-012a-45bd-9e7f-e27f602edc51
---

GOAL: continue the YURI moat + the new circuitry/visual + research-transfer threads. WHO: Marcel (owner, gates commits + owner-terminal); Claude main drives. WHEN: handoff 2026-06-03 EOT. WHERE: repo `/Users/marcelspatz/YURI-OS-MUSUBI`, branch main, fully synced to origin (5 commits this session: `52ee7488`→`cd042805`).

## NEXT-SESSION ORDER — Marcel directive, do in THIS sequence:
1. **SPEC T3 — MUSUBI ONE packaging spec** (autonomous, no gate). Lock the naked-repo boundary (what's IN the shippable core vs OUT), the privacy/IP line (EXCLUDE bug-bounty/hackerone signals + private vault + the Rick/persona overlay), corpus-curation criteria + license gate. The new math-research catalog may sharpen positioning/codename — skim it first. The 267-mechanism spectrum (`02_RESOURCES/RESEARCH/yuri-mechanism-spectrum-267-2026-06-03.md`) is the inventory for in/out decisions.
2. **B — build a research transfer.** Start with **spectral graph clustering** (catalog #4, juice 8, READ-ONLY, ships today): a pure Node script over `_SYSTEM/yuri-graph-state.json` — it ALREADY surfaced 11 orphan nodes + an independent cross-check. Then #8 counterfactual evidence-ablation (Pearl do-operator leave-one-out over the existing `assessClaim` — load-bearing vs decorative evidence + single-point-of-failure), then #18 Cox proportional-hazards evidence-aging (first energy-fn weight that stops being hand-tuned). Full set: `02_RESOURCES/RESEARCH/math-theory-transfer-catalog-2026-06-03.md` (36 transfers, reindexed/searchable via `ai search`).
3. **A — rework the visual.** Supercharge `yuri-os-dashboard.html` (repo root, tracked — "YURI OS · WebGL Instrument": three.js + OrbitControls + UnrealBloom + EffectComposer + SphereGeometry organ-nodes, 9334 lines) into the LIVE circuitry visual Marcel wants. Feed it the verified `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json` (83 nodes / 153 edges) instead of its stale hand-authored nodes. Add a live-activity pulse layer (recommended: poll-a-file — a small PostToolUse hook stamps `circuitry-live.json` activity each event; page polls + re-renders with a decay-glow). MUST read the full 9334 lines first (read-before-spec); keep the bloom/orbit/3D soul, make it TRUE + LIVE, kill only the crappy. 3D stays (the instrument nails it); 2D was floated by Marcel as fallback only.

4. **DESIGN+BUILD the UPGRADE-PROPAGATION ENGINE** (Marcel vision 2026-06-03, "figure out next session") — when a mechanism is improved, detect+cross-reference the circuitry graph to upgrade every sibling site too, so one idea ripples YURI-wide. It's the cross-domain-transfer-engine turned INWARD; the just-built circuitry graph is its substrate; gate the cascade (don't chain-react). Full spec: [[upgrade-propagation-engine]].

## SHIPPED THIS SESSION (committed + pushed, origin/main)
- **T2 CLAIM CORTEX** (`52ee7488`): `_SYSTEM/Scripts/claim-cortex.mjs` + `.test.mjs` (46/46). Reads work as claims → computeU snapshot (lights α/β/ε/ζ + θ on real work). `assessClaim`→ASSERT/HEDGE/VERIFY-FIRST/RETRACT/EXPLORE; `cortexSnapshot`; **`gateClaimTransition`** = the swap-immune identity gate (closes the delta-gate equal-magnitude/Pythagorean residual WITHOUT touching the owner-gated energy core — see [[delta-gate-severity-laundering]]). 2 adversarial red-team rounds → 17 fail-opens fixed+regressed. Sensor is ADDITIVE/no-live-caller yet.
- **BRAIN-DUMP DECODER v2** — both phases: spec at `02_RESOURCES/RESEARCH/04-BRAIN-DUMP-DECODER.md` (`9ce04deb`, 12-stage pipeline from a 6-archetype/49-failure red-team) + fused NATIVE into `_SYSTEM/persona.md`'s "Decode, don't interrogate" rule (`a8ee4310`). Now always-on every turn.
- **dflash** (`9ce04deb`): verdict PARK (block-diffusion spec-decode draft model on MLX; value is trained weights, no Rust seam, no YURI consumer). Report `02_RESOURCES/research/dflash-viability-2026-06-03.md`.
- **Math-theory research + circuitry graph** (`1d274151`): the catalog above + the 83-node/153-edge graph.
- **CLAUDE.md doc-truth** (`cd042805`): energy gate "does not block" → corrected (it blocks on catastrophic veto when enforced).

## MOAT STATE (full detail: [[moat-activation-4track-2026-06-03]])
T1 energy→enforcing ✅ · T2 cortex ✅ · T4 subconscious --execute ✅ (Marcel armed env.sh) · **T3 packaging spec = NEXT (unblocked).**

## LOOSE ENDS / GOTCHAS
- Circuitry map ✅ COMPLETE + committed: doc `02_RESOURCES/RESEARCH/yuri-circuitry-map-2026-06-03.md` (`ac04ae94`, 167 organs, 9 layers, 5 cross-layer flows, 12 phantoms corrected) + graph `yuri-circuitry-graph.json` (`1d274151`, 83 nodes/153 edges, feeds thread A). The live VISUAL is still the richer "documentation" but the doc is the static reference + the phantom record. NOT a loose end — done.
- Owner cleanup (not mine): shred `~/.config/yuri/env.sh.bak-2026-06-03` + `~/.zshrc.bak-2026-06-03` once shell confirmed; the 69-file pre-existing dirty tree predates this session.
- GitNexus index stale → `npx gitnexus analyze --skip-agents-md` (cortex symbols not in graph yet; optional).
- Remaining moat backlog: Architecture Codex §6 phantom-correction; owner-terminal guard hardenings; CAPSTONE (deep red-team on the YURI CODE).

## CIRCUITRY MAP — LOAD-BEARING FINDINGS (verified against live code, 2026-06-03)
- **BIGGEST DARK EDGE — ✅ CLOSED (cortex now WIRED live, commit `a65a00f2`).** `_SYSTEM/Scripts/claim-ledger.mjs` (the tool-event→claim bridge) + `claimGateFields` are wired into `energy-tick-core.tickAndTrace` (ledger persisted in the energy-session snapshot); the energy-tick PostToolUse path now feeds the cortex's α/β/ε terms into the gate trace on real work. SAFE: claimGateFields OMITS the veto fields (promotionLadderInversions/protectedPathViolations) so it can raise U but never block; the breaker keys on the raw tool-event state (unchanged); fail-open; a lone edit doesn't flip the gate (pinned). **WIRE RED-TEAMED (6 lenses, commit `52cb9cae`):** safety claims #1/#2/#4 held; found+fixed ONE real defect — the WRITE side (cloneClaims/applyClaimTransition) threw on a poisoned persisted ledger (null element), wedging observability for the session (read side was hardened, write side wasn't). Fixed: cloneClaims filters non-objects (self-heals) + applyClaimTransition wrapped fail-open in tickAndTrace + 2 regressions. 111 tests green. **REMAINING (deliberate next steps, NOT done):** (a) v2 = read the agent's ACTUAL prose claims at varied statuses (would light α hard; current v1 is a tool-derived proxy where claims are all fixture_ready); (b) over-claim ENFORCEMENT = let a claim inversion actually block (owner-gated — the swap residual is already closed via `gateClaimTransition`/[[delta-gate-severity-laundering]], so no energy-core L∞ change needed, but wiring θ into the breaker veto IS the gated decision).
- Energy gate = **trailing PDP/PEP split**: PostToolUse `energy-tick` computes ΔU + persists breaker to `_SYSTEM/state/energy-session/<sid>.json`; PreToolUse `energy-enforce` reads it on the NEXT call. It never blocks the call it measures — only the call AFTER a catastrophic veto. Armed locally (flag file present), shipped default OFF.
- Subconscious wired end-to-end but was EMPTY by design (cold store 0 rows) — now armed via T4.
- **DOC-TRUTH backlog (CLAUDE.md still lies in spots):** Cross-Domain-Transfer-Engine is claimed LIVE in CLAUDE.md but NO module exists (it's a future build, PROJ:CROSS-DOMAIN-TRANSFER-ENGINE); search-corpus headers say ~26k docs, real = 38,742; `startup-offload.js` is a skills-frontmatter indexer with ZERO offload code (naming trap, the real organ is `offload-runner.mjs`).
- Brain loads TWICE on purpose (native @-include of CLAUDE.md identity + brain-inject volatile state) — identity survives even if every SessionStart hook fails. Memory/Search wall is structurally enforced (the 4 memory DBs are in the indexer EXCLUDE list).

SEE: [[moat-activation-4track-2026-06-03]] · [[delta-gate-severity-laundering]] · [[claim-evidence-ledger]]
