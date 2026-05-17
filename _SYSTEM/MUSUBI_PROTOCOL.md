# AEONIC_PROTOCOL (legacy compatibility shim)

INHERIT: ./_SYSTEM/yuri-origin.md
INHERIT: ./SOUL.md

Canonical AEONIC/Yuri policy lives in `_SYSTEM/yuri-origin.md`.
This file remains because active hooks and vault domain mapping still look for the exact filename.

## CORE_DIRECTIVES

Use `_SYSTEM/yuri-origin.md` for authority, evidence, mutation safety, protected surfaces, output grammar, and gate routing. Use `SOUL.md` for persona and cognitive workflow.

## GLOBAL_OFFLOAD_DIRECTIVE

Use `Scripts/offload-contract.mjs` as the only lane, scenario, and lifecycle contract. Inspect with `./Scripts/ai route-plan "<request>"`; execute with `./Scripts/ai auto "<request>"`.

## ROLE_MATRIX

The active session is router, verifier, and finalizer. Worker lanes produce bounded evidence. Reviewer lanes are advisory until verified by local evidence.
