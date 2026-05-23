# YURI OS Structure Cleanup Audit

Date: 2026-05-23
Mode: architecture cleanup and navigation hardening
Owner intent: reduce filesystem confusion, preserve useful capabilities, and make model navigation deterministic.

## Executive Read

Your intuition was correct: YURI was not broken, but the repo was visually and operationally noisy.

The problem was not "too many folders." The problem was incompatible folder types sitting at the same visual level:

- human workspace folders
- provider adapters
- runtime/cache folders
- external research/tool checkouts
- generated artifacts
- canonical system files
- early experimental imports

That forced models to guess. Guessing burns tokens, increases wrong turns, and makes the system feel less alive than it actually is.

## Current Ground Truth

`_SYSTEM/yuri-origin.md` remains the canonical authority hierarchy:

1. owner intent
2. local evidence
3. `_SYSTEM/yuri-origin.md`
4. `SOUL.md`
5. context layer
6. thin provider adapters
7. executable routing and verification scripts

The cleanup strengthens that spine.

## What Changed

### 1. Context Layer Promoted

`_SYSTEM/context/README.md` is now a real context contract, not just a note.

New machine-readable selector:

`_SYSTEM/context/context-registry.json`

New CLI:

```bash
node _SYSTEM/Scripts/context-router.mjs "task description"
```

This gives future sessions a deterministic packet before they browse.

### 2. Old Provider/Experiment Identities Retired

Old provider/editor surfaces and early experiment identities are no longer allowed to remain as active architecture names.

The rule is:

- keep useful patterns
- promote them into YURI-owned docs, skills, scripts, or registries
- remove the old named surface from active navigation

This avoids the classic trap where the repo becomes a museum of every tool tried during the learning phase.

### 3. Skill Evolution Promoted

New YURI-owned promotion doc:

`_SYSTEM/docs/YURI_SKILL_EVOLUTION_PROMOTION_2026-05-23.md`

Promoted concepts:

- skills as versioned capabilities
- maturity states
- provenance
- verification
- last-used evidence
- registry-first navigation
- memory/RAG promotion only after proof

### 4. Continuous Session Rule Added

Claude and DeepSeek collaboration must prefer persistent CLI/tmux/PTY sessions.

Headless prompt calls are blocked for Claude routes in `_SYSTEM/Scripts/ai`.

Allowed:

- start or attach the real CLI session
- feed bounded packets through Kagami
- stream deltas back

Forbidden:

- SDK-style Claude calls
- `claude -p`
- Claude `--print` prompt calls
- no-session-persistence prompt calls
- spawning fresh paid provider sessions for every advisory packet

### 5. Folder Registry Becomes Operational

`_SYSTEM/config/folder-registry.json` is the current machine-readable folder classification source.

It answers:

- what is this path?
- should a model read it by default?
- is it protected?
- is it runtime/cache/generated/external?
- who owns it?

This should eventually expand into a full artifact registry covering docs, scripts, JSON, reports, runtimes, skills, generated assets, and model checkouts.

## Correct Model Read Path

```text
owner prompt
  -> Kagami/Rick intake or current adapter
  -> _SYSTEM/yuri-origin.md
  -> SOUL.md
  -> _SYSTEM/context/README.md
  -> _SYSTEM/context/context-registry.json
  -> _SYSTEM/INDEX.md
  -> _SYSTEM/config/folder-registry.json
  -> selected context packet
  -> curated wiki/RAG context when needed
  -> task-specific local docs
  -> implementation files
  -> verification / release gate
```

No model should begin by browsing random root folders. No model should treat provider runtime folders as policy. No model should read generated artifacts unless the task asks for them.

## Root Folder Classes

| Class | Read by default? | Rule |
|---|---:|---|
| Canonical anchors | Yes | Short, stable, inherited by all lanes. |
| Human workspace | Sometimes | Read only when the task needs the domain. |
| System control plane | Targeted | Use `_SYSTEM/INDEX.md` before browsing. |
| Provider adapters | No | Doors, not brains. |
| Runtime/cache | No | Ignore unless debugging runtime. |
| Generated artifacts | No | Regenerate or inspect only for artifact tasks. |
| External checkouts | No | Explicitly relevant only. |
| Local model runtimes | No | Use through routing/health contracts. |
| Protected surfaces | Never | Use wrappers or explicit owner-approved operation. |

## Provider-Neutral Future

Claude-specific files can remain where they add useful local context. That does not make Claude the owner.

Future paid coding subscriptions or model providers should get thin adapters only when the tool requires it. They do not get new root authority.

Root truth remains:

- `_SYSTEM/yuri-origin.md`
- `SOUL.md`
- `_SYSTEM/context/README.md`
- `_SYSTEM/context/context-registry.json`
- `_SYSTEM/INDEX.md`

## New File Placement Rule

Before adding durable files:

1. decide whether it is policy, script, config, skill, wiki, evidence, report, project material, resource, runtime, or archive
2. place it in the matching canonical folder
3. add or update registry/context metadata when it becomes reusable
4. keep generated/runtime output out of the default read path

## Remaining Work

- Expand folder registry into a broader artifact registry.
- Generate a wiki projection from registry files.
- Add a preflight that warns when new root folders are unclassified.
- Finish persistent CLI bridge work so Kagami can control long-lived Claude and DeepSeek sessions without one-shot prompt calls.
- Continue cybersecurity supercharge once the navigation spine is stable.
