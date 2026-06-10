---
name: feedback-codex-lane-not-truly-read-only
description: Codex offload lanes can WRITE files to the workspace even when dispatched with --sandbox read-only (gpt-5.5 default is danger-full-access; the override did not hold). Always verify + clean lane file-writes; never trust the read-only flag as a guarantee.
metadata: 
  node_type: memory
  type: feedback
  tier: high
  scope: orchestration
  trig: 
    - codex
    - lane
    - read-only
    - sandbox
    - dispatch
    - wrote
    - pollution
    - verify
  refs: 
    - feedback-standing-fleet-default-orchestration
    - feedback-verify-maps-before-destructive
    - feedback-full-prerequisite-closure-no-wire-later
  originSessionId: fd6806d3-8e56-47d5-ac11-51d2752c5091
---

RULE: A Codex lane dispatched with `--sandbox read-only` is NOT guaranteed read-only. On 2026-06-06 the R3 Rust-port lane (gpt-5.5, default sandbox danger-full-access) WROTE its output file to disk — into a PRE-EXISTING TRACKED crate (`03_NEXUS-LINK/nexus-engine/crates/nexus-core/src/corpus_match.rs`) — instead of returning code in its message, despite the read-only flag. The override in codex-offload-runner cloned the config but the codex CLI still wrote. R1/R2 returned code blocks (no write); R3 wrote. Inconsistent.

DO: after every lane dispatch, check `git status` for unexpected new/modified files (especially under tracked dirs). If a lane wrote files, VERIFY them (refute-by-default) and RELOCATE/clean to the intended location; revert any modification to tracked files the lane shouldn't have touched. Treat lane file-writes as advisory output that landed on disk, not as accepted changes.

DONT: assume `--sandbox read-only` prevents writes; commit a lane's stray files without verifying they didn't pollute a tracked area; skip the post-dispatch `git status` check.

WHY: R3's write was harmless this time (orphan file, no tracked file modified, build intact — verified via `git diff`), but it could have broken the pre-existing nexus-engine crate if it had also edited that crate's lib.rs. Caught + cleaned during the Rust-transition commit prep. NOTE also a name collision surfaced: the math kernel I built lives at `_SYSTEM/nexus-core-rs` while a DIFFERENT pre-existing `nexus-core` crate (billing/ranking: money/ports/records/veto) lives in the nexus-engine workspace — disambiguate before they confuse.

SEE: [[feedback-standing-fleet-default-orchestration]] (the fleet is advisory-until-verified), [[feedback-verify-maps-before-destructive]].
