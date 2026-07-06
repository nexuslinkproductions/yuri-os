---
name: proj-language-consolidation-priorities
description: "NEXT major operations (owner 2026-06-14) — (1) large-scale Rust consolidation of hot kernels, (2) Mojo adoption for an incoming ML lane, (3) ML entry (crucial soon). Tiered: JS reference+verification / Rust hot kernels / Mojo ML lane"
metadata: 
  node_type: memory
  type: project
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

GOAL: Three committed NEXT operations (owner directives 2026-06-14), a large-scale consolidation:
1. **RUST CONSOLIDATION** — refactor to Rust everything that benefits (hot numerical kernels), for consolidation. Pattern (NOT a rewrite of everything): JS stays the source-of-truth reference + fast-iterating verifiers; Rust is the hot DELIVERY kernel via napi/wasm, **bit-exact-conformance-tested** to the JS reference. Template: `_SYSTEM/nexus-rs`. The energy gate + its provers (B-wave) STAY JS (a verifier must import the verified; the live gate is JS-wired) — Rust-port the gate only once it stops changing.
2. **MOJO ADOPTION** — for the ML/numerical lane (NOT the embedded-kernel tier). MLIR→GPU/TPU, Python-superset perf. Off the gate's hot path. (Owner: "we are adopting mojo.")
3. **ML ENTRY** — "ML is going to be crucial very soon for us." The driver for Mojo. Scope TBD.

WHO: Marcel (owner directive). Claude integrates + verifies + commits; peer lanes (deepseek/mimo/glm) advisory.

WHEN: NEXT — after the substrate-frontier-grade B-wave (complete through B5, on main).

WHERE: research verdict + sources → `02_RESOURCES/RESEARCH/language-consolidation-rust-mojo-zig-2026-06-14.md`. Rust delivery template → `_SYSTEM/nexus-rs`.

STATE: **RUST consolidation Phases 0–2 SHIPPED to main 2026-06-14** (deck `02_RESOURCES/RESEARCH/rust-consolidation-2026-06-14/`). Commits: deck+verified-specs `bca44ae4`, Phase-1 W1 stats + W2 corpus featureFn contract `945bcb52`, Phase-1 W1 ARMED (napi FFI 139/139 + reversible DI seam `_SYSTEM/Scripts/math/nexus-stats.mjs`, default-JS, @napi-rs/cli installed) `4d04b9bd`, Phase-2 deep wave `714a05b5` (round.rs 0-ULP keystone proven 308k vectors; distrib.rs **6/10 0-ULP**, 4 transcendentals entropy/kl/crossEntropy/softmax **HONESTLY STAY-JS** — libm≠V8 last-ULP, not gate-safe; ppmi.rs W4; -fma pin x86_64-scoped + deps libm/indexmap). cargo 71/71, all cargo-lib only, NOTHING wired to live gate, JS stays source-of-truth. Method: work-deck → Phase-0 scoping swarm (10 agents, 3/3 peer convergence) → Phase-1/2 worktree impl swarms → main-tree re-verify. W5 spreading-activation DROPPED (1 benchmark importer, not hot); W3 quantum DEFER (`02-quantum-respec.md`, rank float→int 0-ULP). Mojo + ML lanes NOT started. Language research DONE (Rust embedded / Mojo ML / Zig rejected).

NEXT — Rust (all OWNER-GATED): (a) FFI-bind + arm the 6 new 0-ULP distrib fns + W4 (more binding.rs/conformance + .node rebuild); (b) wasm rebuild needs wasm32 `core` install (homebrew cargo lacks it); (c) stats.rs → delegate to round.rs to make it 0-ULP too; (d) the 4 stay-JS transcendentals need a V8-exact log/exp port to ever move (research). NEXT — strategic: (e) MOJO toolchain + ML-lane entry (priority 2&3, "crucial very soon"); (f) per-soft-term sign+bound invariants for computeU's prover (B5's 44 grey survivors); (g) promote priorities to Track A canonical. Stale `no-commit-without-approval` directive still fires as would-warn (offer to reconcile stands).

SEE: [[feedback-green-red-grey-test-layering]] · substrate B-wave (B3 gate-invariants / B4 gate-trace / B5 mutation-sweep, all on main) · `_SYSTEM/nexus-rs`
