---
name: feedback-paper-dashboard-visual-only
description: Research-paper energy dashboard = READ-ONLY viz of config/weights; live tuning lives ONLY in the separate Energy Cockpit. Never wire live controls into the paper
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["dashboard", "research paper", "energy landscape", "visual only", "tunable weights", "cockpit vs dashboard", "read only"]
  refs: ["[[yuri-app-tuning-cockpit]]", "[[feedback-clean-structure-no-clutter]]"]
---

RULE: The energy-landscape research-paper dashboard (_SYSTEM/reports/energy-landscape-paper-2026-07/energy-landscape-dashboard.html) is a READ-ONLY VISUALIZATION of the energy landscape for Marcel's paper. Any config/weights/knobs shown there are visual representation ONLY — never live or interactive controls that mutate the system. The LIVE tuning surface is the SEPARATE Energy Cockpit (_SYSTEM/reports/yuri-control/index.html), which does apply to energy-weights.json via yuri-control-server.mjs.
WHEN: building/rendering anything in the research-paper dashboard; deciding where tunable controls vs read-only displays belong.
DO: render config in the paper as read-only display (values, tables, charts, badges); keep ALL live mutation in the cockpit; preserve the paper's existing visual language. Data comes from buildConfigSection in yuri-energy-dashboard-data.mjs (the injected REAL block).
DONT: put working sliders / apply-to-live controls into the paper dashboard; conflate the two surfaces.
WHY: the paper is Marcel's proud research artifact — it shows the science, it does not operate the system; a live control embedded in a publication figure is conceptually wrong and risky.
SEE: [[yuri-app-tuning-cockpit]], [[feedback-clean-structure-no-clutter]]
