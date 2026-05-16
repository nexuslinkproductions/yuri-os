---
name: introspect
description: Run visual-introspection against the Yuri OS architecture graph.
trigger: /introspect
skill: visual-introspection
---

# /introspect

Invoke the `visual-introspection` skill.

Read `_SYSTEM/yuri-graph-state.json`, optionally reference `yuri-os-dashboard.html`, and produce a terminal-printable engineering report covering structural audit, dead ends, orphan nodes, cycles, merge candidates, sector coherence, connection quality, and ranked optimization recommendations.
