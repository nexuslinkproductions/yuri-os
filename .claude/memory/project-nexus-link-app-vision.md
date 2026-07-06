---
name: project-nexus-link-app-vision
description: Nexus Link = dedicated Tauri desktop app embodying the ICM/MWP framework + visualising the whole op; Rust engine, isolated from YURI core, smart setup
metadata:
  type: project
  tier: working
  scope: all
  trig: ["nexus link app", "the app", "visualise", "dashboard", "cockpit", "icm", "mwp", "tauri", "build the app", "desktop app", "embody framework"]
  refs: ["[[feedback-prefer-rust]]", "[[feedback-nexus-design-no-hud]]", "[[project_yuri_north_star_vision]]"]
---

GOAL  Build "Nexus Link" — a DEDICATED desktop app Marcel works in that EMBODIES the entire ICM / MWP framework from his repo/local, and visualises everything the operation does (lead pipeline + live scores, ROI/forecast dashboards, the verified platform catalog with sources, pipeline/queue health, outreach status). The cockpit for the autonomous business — the "body" the Rust engine lives inside.

WHO  Marcel (primary operator); Mike later. Single-operator app first.

WHERE  App home: `03_NEXUS-LINK/`. Rust engine: `03_NEXUS-LINK/nexus-engine/` (Cargo workspace; crate `nexus-score` = organ #1, the acquisition math brain, shipped + 40 tests green). Build stack: TAURI (Rust engine backend + a FRESH Nexus Link web-design UI) — Rust-default per [[feedback-prefer-rust]], bespoke per-brand design (Celtic-knot identity) per [[feedback-nexus-design-no-hud]], NOT the YURI HUD look.

CRITICAL SETUP CONSTRAINT (Marcel: "set up very smart so we dont cause any issues")  The app MUST be cleanly ISOLATED from the YURI repo / control-plane: do NOT touch protected paths, do NOT couple to or break the Node control-plane, the JS hooks, or the energy infra. Its own Cargo workspace + its own surface under 03_NEXUS-LINK/; YURI core stays untouched. Decide repo/isolation strategy early (self-contained dir now; possibly its own git later) so the app can never destabilize YURI. No shared mutable state with YURI internals.

ICM / MWP  The framework (from the repo/local) the app must embody — CONFIRM the exact definitions + map every framework surface the app needs to represent BEFORE scaffolding (acronyms not yet pinned down this session; do the lookup first).

STATE  Engine organ #1 (`nexus-score`) shipped + independently verified (cargo test 39+1 green, clippy unwrap/expect/panic=deny clean, no-panic proven). App shell NOT built yet. Verified revenue dataset + (in-progress) painted memo are separate deliverables that feed the app's data.

NEXT  Fresh session: (1) confirm what ICM/MWP are + map the framework surfaces; (2) decide the isolation/repo strategy; (3) scaffold the Tauri shell + first live dashboard (lead scores + ROI driven by nexus-score); then grow crates nexus-verify (scraper) + nexus-recon (bug-bounty) + the pipeline.

SEE  [[feedback-prefer-rust]] · [[feedback-nexus-design-no-hud]] · [[project_yuri_north_star_vision]] · 03_NEXUS-LINK/nexus-engine/ · _SYSTEM/campaigns/nexus-link-acquisition-workbench/
