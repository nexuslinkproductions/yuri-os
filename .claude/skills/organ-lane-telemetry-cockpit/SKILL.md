---
name: organ-lane-telemetry-cockpit
description: "Human-readable cockpit over the Originator lane-telemetry stream. JSONL is the audit substrate, not the operator experience: this reads originator-telemetry.jsonl, groups by traceId, COLLAPSES the…"
triggers:
  - "organ-lane-telemetry-cockpit"
  - "how do I use lane-telemetry-cockpit"
  - "lane-telemetry-cockpit usage"
  - "lane-telemetry-cockpit guide"
  - "Lane Telemetry Cockpit (human-readable view over YURI_LANE_TELEMETRY)"
generated: true
source_node: "lane-telemetry-cockpit"
source_file: "_SYSTEM/Scripts/lane-telemetry-cockpit.mjs"
---

<!-- GENERATED from the canonical graph node "lane-telemetry-cockpit" (mechanism.guide) by _SYSTEM/Scripts/yuri-guide-project.mjs.
     DO NOT hand-edit — edit _SYSTEM/organ-guides.json, then run: node _SYSTEM/Scripts/yuri-guide-seed.mjs && node _SYSTEM/Scripts/yuri-guide-project.mjs -->

# Organ Guide — Lane Telemetry Cockpit (human-readable view over YURI_LANE_TELEMETRY)

**Module:** `_SYSTEM/Scripts/lane-telemetry-cockpit.mjs` · **Layer:** Skills & Orchestration · **Invocation:** both · **CLI:** `(path) [--json] [--limit N]`

**Purpose.** Human-readable cockpit over the Originator lane-telemetry stream. JSONL is the audit substrate, not the operator experience: this reads originator-telemetry.jsonl, groups by traceId, COLLAPSES the noisy stream/stderr/stdout chunk events into counts, and prints a compact per-run timeline (start → model call → verification → exit) with elapsed, heartbeat count, chars streamed, and status — so the operator sees what a lane is doing without reading raw JSON.

## Exports
- `readTelemetry(file = TELEMETRY, opts = {})`
  - in: optional telemetry file path + opts
  - out: parsed telemetry events (malformed lines tolerated)
- `summarizeByTrace(events)`
  - in: telemetry events
  - out: per-traceId summary collapsing chunk events into counts (elapsed, heartbeats, chars, status)
- `renderCockpit(traces, opts)`
  - in: summarized traces + render opts
  - out: the compact human-readable cockpit string

## Security boundary
Strictly READ-ONLY — reads the telemetry JSONL and renders it; never mutates telemetry. Input line-count is bounded (limit guard). No protected-path access.

## When to use
Inspecting what a dispatched lane run actually did (timeline, model call, verification, exit) without parsing raw originator-telemetry JSON; triaging a slow/failed lane run.

## Gotchas
- It collapses stream/stderr/stdout chunk events into COUNTS — individual chunk payloads are not shown (by design, to stay compact).
- Grouping is by traceId; a run without a stable traceId will not group cleanly.
- Read-only over a live-appended file — a snapshot reflects the moment it was read.

## Session Notes
- 2026-06-09 — generated from canonical node `lane-telemetry-cockpit`.mechanism.guide (source-grounded; export list hard-gated against the live module by yuri-guide-seed.mjs). Authored source: _SYSTEM/organ-guides.json.
