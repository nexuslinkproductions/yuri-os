---
name: feedback-prefer-rust
description: Default to Rust for new tools/products/engines (esp. perf/security/shipped); keep YURI Node infra + JS hooks + web deliverables native; Rust->WASM for heavy client
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["rust", "language", "build", "tool", "cli", "engine", "implement", "program", "wasm", "which language", "stack"]
  refs: ["[[feedback-nexus-design-no-hud]]"]
---

RULE  Default to RUST for anything we BUILD as a program/tool/product/engine — especially performance-, reliability-, safety-, or security-sensitive work, and anything shipped (the Nexus Link automation engine, lead source/enrich/score/outreach pipeline, the acquisition-workbench build-slices as crates/binaries, scrapers, bug-bounty/security tooling, CLIs, services, data processing). Single static binary, no runtime, strong types as a correctness + trust signal for a small shop.

WHEN  Choosing the implementation language for a NEW build/tool/product/engine.

DO  Pick Rust by default for new standalone programs. Compile Rust -> WASM when the browser/client needs heavy logic. Idiomatic Rust (Result/Option, cargo, tests).

DONT  Rewrite the existing YURI control-plane (Node `.mjs`/`.cjs`) or the Claude Code hooks (which MUST stay JS — the harness runs node hooks) into Rust. Don't use Rust for web deliverables (HTML/CSS/JS docs, landing pages, UI surfaces — those stay native web). Don't force Rust on throwaway glue/one-offs where bash/node iterates faster.

WHY  Marcel prefers Rust for what the business builds; it fits the fast+safe+own-our-stack ethos and the security/automation product direction — but the existing JS infra, JS-mandatory hooks, and web surfaces have no Rust payoff and high migration cost.

SEE  [[feedback-nexus-design-no-hud]] · 03_NEXUS-LINK/ · _SYSTEM/campaigns/nexus-link-acquisition-workbench/
