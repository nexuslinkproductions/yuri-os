---
name: cyber-hunting-for-dcom-lateral-movement
description: "Hunt for DCOM-based lateral movement by detecting abuse of MMC20.Application, ShellBrowserWindow, and ShellWindows COM objects through Sysmon Event ID 1 (process creation) and Event ID 3 (network connection) correlation, WMI event analysis, RPC endpoint mapper traffic on port 135, and DCOM-specific parent-child process relationships."
hide: true
---

<!-- GENERATED:YURI-CODEX-SKILL-ADAPTER:v1 -->

# YURI skill adapter

Authoritative source: `.claude/skills/cyber-hunting-for-dcom-lateral-movement/SKILL.md`

Authoritative source SHA-256: `aebc3b0fc962a00be63be923e693740115730e19cb208748485db8acbf1d5b3a`

Source class: `cyber-armed`

Before acting, read the authoritative source file above completely from beginning to end. If the governed source is absent, run `node _SYSTEM/Scripts/skill-recall.mjs --show cyber-hunting-for-dcom-lateral-movement` and read its complete verified output. Follow that source as the skill body; this adapter is a non-authoritative metadata-and-pointer projection.
