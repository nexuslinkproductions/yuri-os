---
name: energy-dashboard-and-action-mode
description: DONE: dashboard mechanism-first + de-slopped (33/33); descent-curve viz pending
metadata:
  type: project
  tier: semantic
  scope: all
  trig: ["energy dashboard", "action mode", "dashboard rework", "energy landscape paper", "resume dashboard", "descent curve"]
  refs: ["[[feedback-ai-slop-catalog]]", "[[feedback-publication-voice-no-internals]]", "[[claim-evidence-ledger]]", "[[yuri-named-for-lilly]]"]
---

GOAL: turn the energy-landscape paper dashboard into a unique, moving research showcase + graduate the energy gate from advisory toward sandboxed action mode.
WHO: Marcel (storyteller/artist, marketing bg, loves Japanese design + NVIDIA/Anthropic/OpenAI presentation craft).
STATE (2026-05-31):
  DASHBOARD: BUILT then fully REWORKED to mechanism-first and de-slopped. Leads with "How an action becomes a number" (six steps + a pass/fail operations flow) right after the hero, because the missing piece was explaining HOW a process becomes math, not just listing weights. Slop purged site-wide: no em-dashes, no "real" crutch, no self-labeled honesty, no announcing / internal notes / describe-the-visual. See [[feedback-ai-slop-catalog]]. Factors compacted to a side column and explained (read property, multiply by weight, bank credit or pay penalty); tuning reframed as "Every weight is yours to set"; arithmetic explains how each value is set; geometry = two fields SIDE BY SIDE (rule-on settles into wells / rule-off circulates) with continuous-flow particles; funnel explained; teeth + sandbox MERGED into "A refused move is held, not killed" (held in the sandbox with its reason, operator approves or keeps blocked, the system learns where the line sits over time, which protects an inexperienced user from costly mistakes); removed the controlled-proof (first demo runs) and the state/ledger section; lenses relaid as a card grid; attribution graph removed (its job is the flow now). Fixed a real bug: calc(1fr * phi) in grid-template-columns silently collapsed every split to a stack. One command still regenerates every graph; 33/33 data tests; publication-voice clean [[feedback-publication-voice-no-internals]]. Dark base layer keeps print/PDF safe.
  REMAINING on dashboard: the live descent curve still reads dead (steep drop then flat shelf); owner asked to rework that specific graph (copy done, viz polish pending). Minor dead code (renderAttribution / renderReality defined but uncalled).
  DATA AGGREGATOR: schema v2 (realTraffic / workedMath / attribution / actionStudy sections + 11-component metadata with plain-language names and metas + battery public labels).
  MECHANISM (now on the page): the live hook reads three facts per action (work landed / failed / boundary crossed), moves a small ledger, scores it with computeU, takes ΔU, and the sign decides. Only five of eleven factors are wired live (verified-credit, calibration logLoss+brier, repeat-fail, protected); the other six (drift/KL, claim-entropy, info-gain, staleness, ladder) need the claim-and-evidence ledger.
BACKLOG (owner-set sequence for future DEV sessions):
  1. CLAIM-AND-EVIDENCE LEDGER — read agent work as claims to wire the remaining factors. THE priority. [[claim-evidence-ledger]]
  2. Nexus Link Tauri app. [[project-nexus-link-app-vision]]
  3. "another thing" (owner left unspecified).
  Also still owner-gated from earlier: subconscious go-live (consolidator --execute + atomic memory-archive disable) + sandboxed action enforcer. [[subconscious-memory-build]]
Lilly's spreadsheets: DONE — delivered as a demo proving Claude can fix and improve her work. No longer a pending task. [[yuri-named-for-lilly]]
SEE: [[feedback-ai-slop-catalog]], [[feedback-publication-voice-no-internals]], [[claim-evidence-ledger]], [[feedback-layout-ma-not-slidedeck]], [[feedback-copy-storytelling-mono-no-aware]]
