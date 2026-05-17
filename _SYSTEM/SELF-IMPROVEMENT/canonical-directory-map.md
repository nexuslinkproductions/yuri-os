# Canonical Directory Map

## Current Canonical Layout

| Path | Purpose |
| --- | --- |
| `00_VESSEL/` | Identity, principles, decision posture |
| `01_RHYTHM/` | Daily, weekly, and sprint rituals |
| `02_EXTRACT/` | Lessons, failures, experiments, consolidation |
| `03_GAZE/` | Quarterly direction, capability maps, longer horizon |

## New Canonical Leaf Paths

| Path | Purpose |
| --- | --- |
| `START_HERE.md` | Entry flow |
| `agent-routing.md` | Which agent/runtime handles which improvement job |
| `token-efficiency.md` | Jake-derived compression and context rules |
| `02_EXTRACT/cross-reference-taxonomy.md` | Canonical cross-domain tags and aliases |
| `_SYSTEM/Scripts/self-improvement/cross-reference.mjs` | Cross-domain tag classification and index builder |
| `01_RHYTHM/weekly-comp.md` | Weekly consolidation ritual |
| `_SYSTEM/Scripts/self-improvement/weekly-comp.mjs` | Canonical weekly consolidation runner |
| `02_EXTRACT/experiments/` | Active improvement experiments |
| `02_EXTRACT/archive/raw-lessons/` | Lessons archived after consolidation |
| `02_EXTRACT/prevention-rules.md` | Rewritten rules extracted from raw failures |

## Migration Policy

Do not destructive-rename working directories. Add canonical files first, keep legacy readmes and forwarders until references stop pointing at old paths.
