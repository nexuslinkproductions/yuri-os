# Yuri OS / Exeoflow Frontend Handoff

**Date:** 2026-05-09
**Status:** Provisional continuity note, not an implementation spec
**Owners:** Marcel / Claudio

## Purpose

Capture the working possibility that Exeoflow remains Claudio's business-facing system and source of truth, while Yuri OS sits above it as the intelligence, orchestration, and control layer.

## Current Assumption

- Exeoflow keeps the face of the operation.
- Yuri OS stays as the top layer for memory, routing, workflow intelligence, telemetry, and assisted execution.
- The user experience should feel like one stack, but the ownership boundaries stay separate.

## Why This Split Makes Sense

- It protects Claudio's trusted business surface.
- It lets Yuri add value without replacing existing MS365-centered workflow structure.
- It avoids inventing a duplicate dashboard before the real Exeoflow package exists.
- It preserves a clean route for later integration instead of forcing a premature merge.

## What We Know From the Current Repo

- Yuri already behaves like an operator system rather than a simple app. See [README.md](/Users/marcelspatz/NUDIMMUD/README.md).
- The current backend is local-first, auth-gated, and control-plane oriented. See [backend/src/server.ts](/Users/marcelspatz/NUDIMMUD/backend/src/server.ts) and [backend/src/routes/api.ts](/Users/marcelspatz/NUDIMMUD/backend/src/routes/api.ts).
- The Exeoflow sync path is already modeled as local persistence first, then outbound transmission when available. See [backend/src/services/exeoflow.ts](/Users/marcelspatz/NUDIMMUD/backend/src/services/exeoflow.ts).
- The fusion protocol already states that Nudimmud wraps Exeoflow and never overwrites it. See [\_SYSTEM/EVONEXUS_PROTOCOLS.md](/Users/marcelspatz/NUDIMMUD/_SYSTEM/EVONEXUS_PROTOCOLS.md).
- The frontend already has a shell/module separation pattern that can support a top-layer / face-layer split. See [src/operator/OperatorShell.tsx](/Users/marcelspatz/NUDIMMUD/src/operator/OperatorShell.tsx) and [src/lib/moduleRegistry.tsx](/Users/marcelspatz/NUDIMMUD/src/lib/moduleRegistry.tsx).

## Working Model

### Exeoflow owns

- Client-facing business identity
- MS365-connected operational state
- Billing, scheduling, and client workflow records
- Dashboard surfaces that Claudio expects to recognize as his system

### Yuri OS owns

- Command and orchestration layer
- Memory, retrieval, and summarization
- Agent routing and task dispatch
- Telemetry, status, and risk visibility
- Permissioned automation and cross-system reasoning

## What We Are Not Doing Yet

- Not designing final UI structure from guesswork.
- Not merging brands into one visual identity.
- Not deciding shared auth, shared data ownership, or write-back rules without the Exeoflow artifact.
- Not replacing Exeoflow with Yuri.

## What We Need From Exeoflow Next

- Package manifest
- App entry point
- Route map
- Auth model
- Data ownership rules
- MS365 integration details
- Branding tokens and shell layout
- Embed, proxy, or deep-link rules

## Telegram / OpenClaw Edge

- Claudio can keep using Telegram as the front door if that is already his working habit.
- OpenClaw remains the channel-native execution lane and the bridge to Claude-backed work.
- Yuri can sit above that path as the orchestration layer that prioritizes, summarizes, routes, and records.
- The Claude subscription and Telegram identity should stay Claudio-owned at the edge, not be absorbed into Yuri.
- Durable outputs from that lane should land in `_SYSTEM/OS_KERNEL/memory.db`, not in Telegram or the OpenClaw session cache.
- Yuri should never depend on the Telegram surface being the source of truth; Telegram is the interface, memory is the record.

## Decision Gate Once Exeoflow Arrives

We decide then:

- Shared shell or separate shell
- Embedded Yuri overlay or route handoff
- Shared auth or delegated auth
- Read-only sync or write-back sync
- One brand system or two branded zones

## Recommendation

Keep Exeoflow as the face and Yuri as the top layer. Build only the seams until the real package arrives, then fit the overlay to the actual structure instead of guessing the structure first.
