---
name: feedback-full-prerequisite-closure-no-wire-later
description: "STANDING (Marcel 2026-06-06) — satisfy the FULL prerequisite closure of a task before calling it done; do it right from the get-go, NO \"we'll wire that in later\" workarounds/stubs"
metadata: 
  node_type: memory
  type: feedback
  tier: binding
  scope: execution
  trig: 
    - prerequisite
    - install
    - missing
    - dependency
    - wire later
    - workaround
    - stub
    - toolchain
    - do it right
  refs: 
    - feedback-standing-fleet-default-orchestration
    - prose-not-outrun-wiring
    - cross-reference-engine
    - feedback-gate-hardening-fail-closed
  originSessionId: fd6806d3-8e56-47d5-ac11-51d2752c5091
---

RULE: Anything REQUIRED to do a task correctly must be DONE as part of the task — not stubbed, deferred, or worked around with "we'll wire that in later." Satisfy the full prerequisite CLOSURE: the task pulls in a dependency → which pulls in sub-dependencies → check and satisfy ALL of them before calling the work done. Do it right from the get-go.

WHEN: any build/transition with prerequisites — missing toolchain, missing binding layer, missing install, an unwired integration. Especially when "do it now while small" (the cost of doing it right grows with the codebase).

DO: when preparing a task, cross-reference what it actually requires (this is cross-referencing in action — checking Rust availability surfaced that napi-cli/wasm-pack were also missing); install/build/wire every required piece; prove the END-TO-END result (e.g. Node actually calling the Rust binding bit-exact, not just a pure crate that "could" be wired). If a prerequisite needs owner approval (install, network), surface it and get the nod — then do it fully.

DONT: ship "the core now, the binding later"; leave an integration unwired and call it done; stub a dependency; pick the workaround because the full path needs an install. Half-wired is not done.

WHY: Marcel (2026-06-06): "anything that is required to do a task needs to be done, not a workaround 'we'll wire that in later' shit, we do things right from the get go." He flagged it precisely when I'd framed the Rust port as "pure crate now, napi/wasm binding later" — he installed the toolchain and directed the FULL bound+proven transition. Ties to PROSE-NOT-OUTRUN-WIRING (verify the live wiring, not the happy-path intention).

SEE: [[feedback-standing-fleet-default-orchestration]], [[prose-not-outrun-wiring]], [[cross-reference-engine]] (this is cross-referencing the full requirement set), [[feedback-gate-hardening-fail-closed]].
