# Wave-3 Learning Domain — Fix Wave Report (2026-06-11)

Executor: Claude (Fable 5). Decisions: **D-L1 OWNER-MODIFIED (nightly Sonnet agent via native Claude cron — NOT DeepSeek)**, D-L2=B dormant, D-L3=B document starved.

## Phase 0 baseline
dream-queue 914 lines / 898 pending / 0 processed (3 weeks write-only) · ~/.yuri has no lane-calibration.json · 02_EXTRACT/entries = empty.

## Landed (9/9 WPs — 2 drift-resolved)
- **WP-L.1 (D-L1, modified)** Dream loop CLOSED for the first time:
  - **Validation drain executed in-session** (this Claude lane = the synthesis engine, per the owner's no-DeepSeek directive): all queue entries point at ONE overwritten snapshot (`.dream-prompt.txt`), so the honest drain = one synthesis of the current snapshot + backlog flip. Result: **909 processed, 4 failed** (pre-rename `/Users/marcelspatz/YURI/.claude/nisaba/` paths — snapshots gone), **5 rules appended** as `### Auto-synthesized 2026-06-11` to global.md (now 2 blocks; brain-inject picks them up next boot).
  - **Nightly trigger armed**: native Claude cron job `2e93de59` (02:13 daily) spawning a background Sonnet agent that performs the same native drain. **LIMITATION (named, not hidden):** the native cron is session-bound with a 7-day auto-expire — it is NOT a LaunchAgent-grade persistent trigger. A truly persistent nightly Sonnet run needs a scheduled cloud routine (`/schedule`, billed — owner call) since a LaunchAgent cannot legally invoke Claude headless (`claude -p` forbidden). Until then: the cron covers active weeks; the manual fallback is `node _SYSTEM/Scripts/yuri-dream-processor.mjs` (its DeepSeek path annotated as superseded by D-L1).
  - Synthesized rules include a meta-fix for the loop itself: dedupe queue signals to unique content before synthesis (the 898-pending pile was one snapshot's signal multiplied).
- **WP-L.2** — **DRIFT-RESOLVED**: `readCalibration()` already defaults to `.claude/state/lane-calibration.json` with the "old ~/.yuri default never existed at runtime" comment (fixed in an earlier session; wave-2 carryover). Gate probe: 0 `~/.yuri` refs.
- **WP-L.3 (D-L2-B)** 02_EXTRACT declared **DORMANT** (README status header: last entry 2026-W20, no feeder, reactivates when entries/ receives input); prevention-rules marked **UNVERIFIED/advisory-only**; failure-log marked **TEMPLATE-ONLY**.
- **WP-L.4** FEL claims corrected to reality across SKILL.md (description now says regression SPECIFICATION, visible in the live skills index), architecture.md, tests.md.
- **WP-L.5** — **DRIFT-RESOLVED**: `session-capture.js` no longer exists on disk (deleted upstream); doubly-orphaned organ already gone. 0 settings refs.
- **WP-L.5b (D-L3-B)** starvation documented at computeCalibration (lane-feedback.jsonl has no producer; calibration neutral until --record is wired deliberately).
- **WP-L.6** both forwarders (01_RHYTHM/weekly-sprint.md + 02_EXTRACT/weekly-consolidation.md — the 01_RHYTHM/weekly-consolidation.md the spec cited doesn't exist) collapsed to one-line STATUS: FORWARDER pointers at weekly-comp.mjs.
- **WP-L.7** learningCapture annotated in route-plan output (0 downstream readers; wiring blocked on D-L2 dormant status).

## Final acceptance gate (9/9, gates 2/7 adapted)
1. baseline captured ✓ 2. trigger armed ✓ **adapted** (native cron + named persistence limitation, per owner-modified D-L1) 3. processed 910 > 0, Auto-synthesized 2 > 1 ✓ 4. only `.claude/state` path ✓ (drift-resolved) 5. DORMANT declared ✓ 6. FEL clarified ✓ 7. session-capture ✓ **adapted** (file already deleted) 8. starvation note ✓ 9. D-L1..3 in tracker ✓. Syntax green on all edited scripts.

## What genuinely closes now (vs audit's 5/14 edges)
dream → synthesize → global.md → brain-inject: **CLOSED** (first cycle ever completed). Lane-calibration read path: closed (input still starved by design, documented). 02_EXTRACT: honestly dormant.

## PARKED
L.A–L.G stand. Audit follow-ups L.AUDIT-1..4 open (L.AUDIT-2 note: probability-calibration-log.md staleness now partially covered by H.3's brain-inject guards only for the three guarded loaders — calibration log loader not guarded; add to a future pass).
