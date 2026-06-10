---
name: yuri-app-tuning-cockpit
description: In-app futuristic tuning cockpit for neuro knobs + OPEN decision: Rust-native frontend (Leptos) vs SvelteKit
metadata:
  type: project
  tier: semantic
  scope: all
  trig: ["tuning cockpit", "app tunables", "visual feedback", "rust native frontend", "leptos", "sveltekit", "knobs in app"]
  refs: ["[[neuro-tunables-map]]", "[[brain-inspired-memory-evolution]]"]
---

GOAL: every neuro/calibration tunable (surpriseK, forget-rate, depthThreshold, future linking/consolidation/homeostatic knobs) tunable INSIDE the YURI app, in one dedicated futuristic area with a LIVING visual model that reacts/gives feedback as the owner turns a knob — "watch Yuri's nervous system respond."
BACKEND: _SYSTEM/config/neuro-tunables.json (the canonical knob surface) is the data layer the cockpit reads/writes.
OPEN ARCHITECTURE DECISION (deliberate, not inherited): app frontend = Rust-native? Rauthy(auth)=Rust ✓. SvelteKit=the one JS exception (display-only, picked for ship-speed + uPlot charting). As ambition grew past the 2-week money-slice, the all-Rust frontend (Leptos/Dioxus, Rust→WASM) is back on the table at a v1-speed cost. The cockpit's heavy interactive viz (living model + live feedback) sharpens the call: Three.js (mature JS) vs Bevy/wgpu (all-Rust, more work). DECIDE before committing M2 frontend.
STATE: owner idea (2026-05-31); not built. Ties to plan M2 (Tauri app shell).
SEE: [[neuro-tunables-map]], [[brain-inspired-memory-evolution]]
