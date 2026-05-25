# YURI Truth Promotion Next Session Packet

Date: 2026-05-25
Owner: Codex/main
Status: active handoff
Purpose: preserve the deep YURI capability audit and force the next session to start with the truth-promotion layer, not another shallow rediscovery pass.

## Session Result To Preserve

This session paused broad math expansion because the Shintai/council audit showed a more urgent system-level issue:

YURI has real control-plane machinery, but the narrative layer can outrun executable truth. The next sprint must therefore build a truth-promotion layer before adding more capability surfaces.

The highest-value identity statement is:

> YURI is a governed local AI control plane for single-operator research, engineering, memory, audit, math, and creative operations.

Do not describe YURI externally as:

- a literal operating system
- a SOC
- a SIEM
- an XDR
- an autonomous pentest platform
- a cybersecurity company
- production-ready infrastructure
- runtime protection

Those are future branches or metaphors unless executable proof and promotion status support them.

## Audit Evidence

Primary council artifact:

- `_SYSTEM/state/shintai-advisory/shintai-2026-05-25T11-10-31-941Z.json`

Qwen sterile retry artifact:

- `_SYSTEM/state/shintai-advisory/qwen-397b-sterile-retry-2026-05-25T11-19-40-244Z.md`

These are runtime state artifacts, not committed source. They are cited here so the next operator can inspect them locally.

## Reliability Fixes Completed This Session

Committed scope should include:

- `_SYSTEM/Scripts/shintai-dispatch.mjs`
- `_SYSTEM/Scripts/shintai-dispatch.test.mjs`
- `_SYSTEM/Scripts/lane-session.mjs`
- `_SYSTEM/Scripts/lane-session.test.mjs`
- `_SYSTEM/Scripts/offload-runner.mjs`
- `_SYSTEM/Scripts/offload-runner-rails.test.mjs`
- `_SYSTEM/Scripts/offload.sh`

Behavior fixed:

1. Shintai member calls now run in parallel while preserving member order.
2. NIM lane sessions are isolated by concrete model instead of all sharing `nvidia-nim__default.jsonl`.
3. Lane-session trim is race-tolerant when concurrent processes rotate the same file.
4. Health probes pass `--no-session` and do not persist `PONG` into lane memory.
5. `offload.sh` forwards `--no-session`, `--session`, and `--fresh` to `offload-runner.mjs`.
6. Focused regressions verify parallel calls, sterile probes, NIM session isolation, and no-session wrapper behavior.

## Council Analysis To Remember

DeepSeek:

- Strongest implementation critique.
- Rated most domains low because it looked for executable production machinery.
- Found the critical contradiction between cyber proof labels and runtime evidence.

Nemotron:

- Correctly framed YURI as specialized AI-agent control plane, not an OS.
- Useful recommendations: telemetry, memory scope enforcement, release gates, health-aware dispatch.
- Reject direct kernelization of neurodivergent rails until behavior and scope are clearer.

Mistral Large:

- Strongest external-positioning reality check.
- Called YURI a private command surface for one operator.
- Flagged cyber-company/SOC language as false.
- Overrated automation and app-dev maturity in places; Codex/main should calibrate downward.

GPT-OSS:

- Focused on overengineering and identity drift.
- Useful warning: rails/councils/research stacks add maintenance burden unless linked to runtime validation.
- Reject blanket trimming of guardrail categories before testing them.

Qwen Coder:

- Mostly thin, but aligned that OS/cyber claims exceed implementation.

Qwen 397B sterile retry:

- Called YURI a "Control-Plane Orchestrator & Forensic Audit Engine."
- Useful warning about analytical/audit capability versus live telemetry.
- Reject optimistic "Cyber High Fit" and "Guardrails A-" wording as too generous for current runtime evidence.

Codex/main arbitration:

- YURI is not "just scripts"; it is an early but real governed control plane.
- The dangerous gap is not lack of ideas; it is lack of promotion authority between research, fixture, runtime proof, and trusted truth.
- The next sprint must create this authority.

## Domain Ratings After Arbitration

| Domain | Current status | Priority |
|---|---|---|
| Shintai/model orchestration | Real, now materially repaired | Protect and harden |
| Codex-led app development | Real local engineering workflow | Add CI/release proof later |
| Memory/RAG | Real surfaces, weak authority/provenance | High |
| Math substrate | Promising executable proof direction | Pause expansion, make governed |
| Governance | Strong concepts, partial enforcement | Highest |
| Cybersecurity | Research/audit/fixture only | Downgrade claims |
| Release management | Mostly docs and gates | Later, after truth gates |
| Resource management | Timeouts/routing only | Later, after health/status gates |
| Creative production | Strong operator fit | Later pipeline work |
| Subdivisions/team ops | Lane roles, not departments | Not immediate |

## Next Sprint Objective

Build the YURI truth-promotion layer.

The next session should not start by adding new math, cyber, or OS features. It should preserve the audit and implement the layer that decides what can be called true.

## Required Next-Session Startup

1. Read `AGENTS.md`.
2. Read YURI startup files in order:
   - `_SYSTEM/yuri-origin.md`
   - `SOUL.md`
   - `_SYSTEM/context/README.md`
   - `_SYSTEM/context/context-registry.json`
   - `_SYSTEM/INDEX.md`
3. Run:

```bash
node _SYSTEM/Scripts/context-router.mjs "truth promotion layer, claim integrity, artifact promotion, audit preservation"
```

4. Load this packet:

```text
_SYSTEM/reports/YURI_TRUTH_PROMOTION_NEXT_SESSION_2026-05-25.md
```

5. Inspect current Shintai/offload reliability code:

```text
_SYSTEM/Scripts/shintai-dispatch.mjs
_SYSTEM/Scripts/shintai-dispatch.test.mjs
_SYSTEM/Scripts/lane-session.mjs
_SYSTEM/Scripts/lane-session.test.mjs
_SYSTEM/Scripts/offload-runner.mjs
_SYSTEM/Scripts/offload-runner-rails.test.mjs
_SYSTEM/Scripts/offload.sh
```

6. Do not read protected paths:

```text
backend/data/
_SYSTEM/backend/data/
_SYSTEM/recovery/
.env
.claude/state/
.claude/history/
.claude/file-history/
.claude/projects/
.claude/worktrees/
node_modules/
.amp/
needle/
```

## Immediate Implementation Plan

### 1. Preserve Audit As Source-Controlled Report

Create or extend a durable report:

```text
_SYSTEM/reports/YURI_ACTUAL_CAPABILITY_AUDIT_2026-05-25.md
```

Required sections:

- Accepted identity
- Rejected identity claims
- Lane-by-lane findings
- Codex/main arbitration
- Domain ratings
- Accepted claims
- Rejected claims
- Evidence gaps
- Next hardening priorities

Register it in `_SYSTEM/config/artifact-registry.json`.

### 2. Implement Claim Integrity Gate

Create:

```text
_SYSTEM/Scripts/claim-integrity-gate.mjs
_SYSTEM/Scripts/claim-integrity-gate.test.mjs
```

The gate must scan selected docs/reports for high-risk claim terms:

- `OS`
- `operating system`
- `production-ready`
- `proven`
- `verified`
- `trusted`
- `cybersecurity company`
- `SOC`
- `SIEM`
- `XDR`
- `runtime protection`
- `autonomous`

Do not blindly ban terms. Require support:

- a promotion status
- executable test reference
- artifact id
- proof state
- explicit advisory/research qualifier

Any unsupported high-risk claim should produce structured findings.

### 3. Define Promotion Ladder

Use this canonical ladder unless the codebase already has a stronger one:

```text
draft
research
fixture_ready
runtime_tested
operator_validated
trusted
deprecated
```

The first pass can be a schema/doc plus tests. It does not need to mutate every artifact immediately.

### 4. Wire Claim Gate Into Verification

Add a small test or script path so future reports can be checked.

Minimum command:

```bash
node _SYSTEM/Scripts/claim-integrity-gate.test.mjs
```

Preferred command:

```bash
node _SYSTEM/Scripts/claim-integrity-gate.mjs --path _SYSTEM/reports/YURI_ACTUAL_CAPABILITY_AUDIT_2026-05-25.md
```

### 5. Add Non-Substantive Lane Output Detection

Shintai should mark outputs degraded if they are:

- `PONG`
- schema headings only
- too short for the requested task
- missing required output sections
- mostly stderr

Do not overbuild. Add a focused helper and tests first.

### 6. Math Remains Paused Except Governance Integration

Do not add new formula banks until truth promotion exists.

Allowed math work in next sprint:

- add promotion-status language to formula card schema
- ensure formula cards can be scanned by claim-integrity gate
- tie math proof states to the promotion ladder

Not next:

- theorem provers
- more visual proof labs
- symbolic regression
- WASM
- new formula domains

## Verification Commands For Next Session

Start with:

```bash
git status --short
node _SYSTEM/Scripts/lane-session.test.mjs
node _SYSTEM/Scripts/shintai-dispatch.test.mjs
node _SYSTEM/Scripts/offload-runner-rails.test.mjs
node _SYSTEM/Scripts/root-architecture.test.mjs
```

After implementing truth promotion:

```bash
node _SYSTEM/Scripts/claim-integrity-gate.test.mjs
node _SYSTEM/Scripts/artifact-registry.mjs --validate
node _SYSTEM/Scripts/root-architecture.test.mjs
```

Run broader health only if operational surfaces changed:

```bash
node _SYSTEM/Scripts/yuri-health.mjs
```

## Next Session Prompt

Use this prompt:

```text
Rick, continue in /Users/marcelspatz/YURI-OS-MUSUBI.

We are starting the YURI truth-promotion layer sprint.

First obey startup:
- Read AGENTS.md.
- Read _SYSTEM/yuri-origin.md, SOUL.md, _SYSTEM/context/README.md, _SYSTEM/context/context-registry.json, _SYSTEM/INDEX.md.
- Run `node _SYSTEM/Scripts/context-router.mjs "truth promotion layer, claim integrity, artifact promotion, audit preservation"`.
- Load `_SYSTEM/reports/YURI_TRUTH_PROMOTION_NEXT_SESSION_2026-05-25.md`.

Goal:
YURI must stop confusing research, fixture readiness, runtime proof, operator validation, and trusted operating truth.

Do not expand math, cyber, or OS features first.
Implement the next hardening layer:
1. Preserve the actual capability audit as a source-controlled report.
2. Add a claim-integrity gate for unsupported OS/proven/cyber/production/trusted claims.
3. Define a promotion ladder: draft, research, fixture_ready, runtime_tested, operator_validated, trusted, deprecated.
4. Register new durable artifacts in `_SYSTEM/config/artifact-registry.json`.
5. Add tests.
6. Add Shintai non-substantive output detection if time allows.

Be very thorough. Do not give a shallow plan. Implement or produce a concrete engineering plan with files, schemas, tests, commands, and next actions.

Protected paths remain sealed:
backend/data/
_SYSTEM/backend/data/
_SYSTEM/recovery/
.env
.claude/state/
.claude/history/
.claude/file-history/
.claude/projects/
.claude/worktrees/
node_modules/
.amp/
needle/
```

## Important Tone For Next Run

Do not let the next session answer with "YURI is not an OS" and stop there.

The required depth is:

- lane evidence
- Codex arbitration
- concrete files
- executable gates
- tests
- registry updates
- verification
- scoped commit only when Marcel authorizes it

The improvement is major and should be treated as system architecture, not a doc cleanup.
