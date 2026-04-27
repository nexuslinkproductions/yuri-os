# Non-Destructive Infinity Guard

**Extension ID:** `non-destructive-infinity-guard`  
**Anime metaphor:** Limitless / Infinity  
**Primary command:** `/yuri guard`  
**Default mode:** `always_on`

## Purpose

Non-Destructive Infinity Guard translates Limitless / Infinity into a Yuri OS / Nudimmud enterprise extension for always-on action boundary, risk classifier, and mutation approval gate.

## Core principle

Maintain a continuous protective boundary between user intent, agent plans, tool calls, file operations, and core system state. Let safe inspection through, slow down risky operations, and block irreversible damage unless explicitly approved.

## Research reference

https://jujutsu-kaisen.fandom.com/wiki/Limitless

## Accepted inputs

- `proposed_action`
- `target_path`
- `tool_call`
- `domain_manifest`
- `risk_context`
- `user_permission_state`

## Produced outputs

- `safety decision`
- `risk classification`
- `approval requirement`
- `safe alternative`
- `rollback requirement`
- `audit event`

## DNA-level behavior

This extension is not a loose utility. It should influence how Yuri thinks and operates whenever the relevant condition appears.

- It must inherit the enterprise control plane.
- It must log important decisions.
- It must default to non-destructive behavior.
- It must propose changes before applying them.
- It must integrate with EOT reflection when applicable.
- It must update memory only through explicit, reviewable proposals.

## Required dependency extensions

See `EXTENSION_REGISTRY.yaml` for dependency relationships.
