# Local Execution Policy & Data Flow Protocol

**CRITICAL NOTICE**: To maintain system integrity and prevent synchronization conflicts, the following rules govern all AI agent operations.

## 1. Workplace Restriction

ALL primary development and file modifications MUST occur exclusively within the local directory:
`/Users/marcelspatz/NUDIMMUD/`

## 2. Data Flow Protocols

### T7 to Local (Automatic Ingestion)

Data synchronized from the `/Volumes/T7` drive (external sync source) should be injected into the local system **carefully and automatically**. This direction is authorized for automation.

### Local to T7 (Manual/Supervised Sync-Back)

Injecting data from the local system back to `/Volumes/T7` is a high-risk operation that can affect the main sync system.

- This MUST be executed **under explicit supervision and "manually"**.
- NEVER perform automated batch writes or bulk syncs from Local -> T7 without user oversight.

## 3. Verification

Before every write operation, the agent must verify the target path and the direction of data flow.

- **DEFAULT**: Work locally in `/Users/marcelspatz/NUDIMMUD/`.
- **INGESTION**: T7 -> Local (Careful & Automatic).
- **SYNC-BACK**: Local -> T7 (Manual & Supervised).

---

### Rule Correction

Rule corrected: 2026-04-21
