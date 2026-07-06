---
name: Shintai dispatch — main thread is overseer not researcher
description: When Marcel delegates to Shintai/lanes, main thread must NOT gather evidence itself. Dispatch immediately to lanes.
type: feedback
originSessionId: de90abf3-c289-46bb-ae93-b788728d46a7
---
Main thread = overseer + finalizer only. When user says "shintai audit" or any delegation keyword, do NOT run Bash evidence-gathering pre-reads on the main thread. The lanes do the gathering inside their own prompts.

**Why:** User correction 2026-05-18: "you do not do ground truth gathering, i said shintai, not claude." Starting with parallel Bash reads is violating the offload-default rule and doing the worker's job on the main thread.

**How to apply:** On any audit/research delegation, first action must be offload dispatch (bash _SYSTEM/Scripts/offload.sh or bash _SYSTEM/Scripts/ai auto). Never open Bash for evidence collection before the first dispatch.
