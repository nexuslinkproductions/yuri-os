---
name: cyber-detecting-beaconing-patterns-with-zeek
description: "Performs statistical analysis of Zeek conn.log connection intervals to detect C2 beaconing patterns. Uses the ZAT library to load Zeek logs into Pandas DataFrames, calculates inter-arrival time standard deviation, and flags periodic connections with low jitter. Use when hunting for command-and-control callbacks in network data."
hide: true
---

<!-- GENERATED:YURI-CODEX-SKILL-ADAPTER:v1 -->

# YURI skill adapter

Authoritative source: `.claude/skills/cyber-detecting-beaconing-patterns-with-zeek/SKILL.md`

Authoritative source SHA-256: `9bbbb1b78bff61f177548f59547af3384828aff52eed2b768734bd6d7d84d684`

Source class: `cyber-armed`

Before acting, read the authoritative source file above completely from beginning to end. If the governed source is absent, run `node _SYSTEM/Scripts/skill-recall.mjs --show cyber-detecting-beaconing-patterns-with-zeek` and read its complete verified output. Follow that source as the skill body; this adapter is a non-authoritative metadata-and-pointer projection.
