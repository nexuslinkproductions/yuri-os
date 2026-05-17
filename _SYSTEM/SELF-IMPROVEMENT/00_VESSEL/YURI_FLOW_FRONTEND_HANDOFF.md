# Yuri OS / Yuri Flow Frontend Handoff

**Date:** 2026-05-09
**Status:** Provisional continuity note, not an implementation spec
**Owners:** Marcel / Claudio

## Purpose

Capture the current Yuri-native model for the workflow cockpit: Yuri Flow is the business-facing capability surface, while Yuri OS remains the intelligence, orchestration, and control layer.

## Current Assumption

- Yuri Flow owns workflow-facing language and route semantics.
- Yuri OS stays as the top layer for memory, routing, workflow intelligence, telemetry, and assisted execution.
- External partner exports stay quarantined as read-only source records until an explicit integration contract exists.

## Why This Split Makes Sense

- It protects Claudio's trusted business workflow while removing split product identity from Yuri OS.
- It lets Yuri add value without replacing existing MS365-centered workflow structure.
- It avoids inventing duplicate dashboards before concrete external package details exist.
- It preserves a clean route for later integration instead of forcing a premature merge.

## What We Know From the Current Repo

- Yuri already behaves like an operator system rather than a simple app. See [README.md](/Users/marcelspatz/YURI-OS-MUSUBI/README.md).
- The current backend is local-first, auth-gated, and control-plane oriented. See [backend/src/server.ts](/Users/marcelspatz/YURI-OS-MUSUBI/backend/src/server.ts) and [backend/src/routes/api.ts](/Users/marcelspatz/YURI-OS-MUSUBI/backend/src/routes/api.ts).
- The Yuri Flow sync path is modeled as local persistence first, then outbound transmission when available. See [backend/src/services/yuriFlow.ts](/Users/marcelspatz/YURI-OS-MUSUBI/backend/src/services/yuriFlow.ts).
- The fusion protocol states that Yuri wraps partner workflow records and never overwrites the external source. See [\_SYSTEM/EVONEXUS_PROTOCOLS.md](/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/EVONEXUS_PROTOCOLS.md).
- The frontend already has a shell/module separation pattern that can support a top-layer / face-layer split. See [src/operator/OperatorShell.tsx](/Users/marcelspatz/YURI-OS-MUSUBI/src/operator/OperatorShell.tsx) and [src/lib/moduleRegistry.tsx](/Users/marcelspatz/YURI-OS-MUSUBI/src/lib/moduleRegistry.tsx).

## Working Model

### Yuri Flow owns

- Workflow-facing business language
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
- Not deciding shared auth, shared data ownership, or write-back rules without a concrete external package artifact.
- Not allowing external product naming to leak into Yuri OS routes, status output, or active docs.

## What We Need From External Workflow Packages Next

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

## Decision Gate Once An External Workflow Package Arrives

We decide then:

- Shared shell or separate shell
- Embedded Yuri overlay or route handoff
- Shared auth or delegated auth
- Read-only sync or write-back sync
- One brand system or two branded zones

## Recommendation

Keep Yuri Flow as the workflow face and Yuri OS as the top layer. Build only the integration seams until a real package arrives, then fit the overlay to the actual structure instead of guessing the structure first.
