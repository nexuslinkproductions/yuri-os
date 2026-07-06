# P2 BUILD PLAN — synthesized from 3 ollama-cloud peers (grounded, verified)

> Peers (all read the real code via tools): glm-5.1 (reliability/scale), minimax-m3 (filing integration/persistence), nemotron-3-ultra (persistence/test gate). Cross-wired here. Owner discipline: every new mechanism DISARMED + two-flag arm; synthetic-test first; no live-store mutation until owner greenlights arming.

## CONVERGENCE (where ≥2 peers independently agree = high confidence)
- **Generation rotation is the correctness keystone** (glm + nemotron): `rename()` on a live log orphans a writer's fd → silent loss. Fix = `canonical-gen-NNNNN.jsonl` + `canonical-current.jsonl` symlink + `SEAL` sentinel + `realpathSync` before each append + unlink only after SEAL_TTL. (Matches DeepSeek fault #9 + [[feedback-posix-fs-concurrency-floor]].)
- **Single-disk gitignored store = #1 risk** (all 3 + my design): off-disk backup MUST automate before P2 arming.
- **Stream-read, not `readFileSync`** (glm): `readFromOffset`/`canonicalEventIds`/`foldCanonical` OOM at scale → `createReadStream`+readline, O(active_claims) memory.
- **Reuse existing primitives** (minimax capability map): `nano-lease`, `atomicWriteFile`, `stalenessScore`, `armedState`, `PINNED_ANCHORS`, `CANONICAL_ZONES`, `planHashOf`, `contentHashOf` — capability-first, no new primitives where one fits.
- **Exactly-once is already by construction** (nemotron confirms): checkpoint-offsets-LAST + dedup-seed-from-canonical = zero dup/loss across crash/restart/session. P1 got this right.

## BUILD ORDER (reversible-first, each independently valuable + testable)

**Inc 1 — Stream-read refactor (foundational, no behavior change).** Replace `readFileSync` in `readFromOffset`/`canonicalEventIds`/`foldCanonical` with a shared `streamReadJsonl(path, fromOffset, onLine)`. Bounded memory. Gate: existing 9 tests stay green (pure refactor).

**Inc 2 — Generation rotation (correctness keystone, glm+nemotron).** `canonical-gen-NNNNN.jsonl` + `canonical-current.jsonl` symlink; `appendClaim`/drainer write via `realpathSync(current)`; `sealGeneration()` = append `{kind:SEAL,gen}` → create gen+1 → `symlinkSync` swap (atomic); `listGenerations()` scans all gens oldest→newest for dedup; unlink gen only after `SEAL_TTL_MS` (60s) with no appends. Gate: new test — writer holds fd, rotate mid-stream, post-rotate appends land in gen+1, zero loss (single-process first, then multi-process Inc 5).

**Inc 3 — Compaction (no dirt, glm+minimax).** Drainer rewrites active gen keeping only live events (drop retracted/superseded) when dead-ratio > 0.3 or gen > ROTATION_SIZE (50MB). `compactionScore(event, ageHours)` wraps `stalenessScore` (retract=1, dethroned=0.9, else decay) — for LOG-SIZE only, NEVER retract decisions (those are causal/VC). Shard compaction: unlink dead-session shards (pid dead + TTL via `reclaimLeases` signal). Gate: compaction test — superseded chain collapses to final state, dedup intact.

**Inc 4 — Drainer daemon + SIGTERM (glm).** `drainDaemon(drainerId, {intervalMs})` → `{stop()}`; **lease per cycle, not held across sleep** (no orphan; TTL is fallback); SIGTERM/SIGINT → `releaseLease` immediately + abort. Gate: daemon start/stop test; lease not orphaned after SIGKILL between cycles.

**Inc 5 — Multi-process fault-injection suite (nemotron T1-T10 ∪ glm T8-T12).** `fork()` workers (`mcs-test-worker.mjs`): T-concurrent (8×500 distinct shards), T-torn (SIGKILL mid-append), T-dedup-race, T-drainer-crash-recovery, T-split-brain, T-dead-owner-reclaim, T-half-folded, T-rotation-under-write, T-disk-full (ENOSPC mock), T-clock-skew (VC not wall-clock). **This is the arming gate** — all green before any live arming.

**Inc 6 — Filing↔memory seam (minimax S1, additive).** `assess()` recommending placement → `appendClaim('filing', …, {subject:'filing.placed'|'filing.misplaced', supersedes-chained})`, TRANSITION-ONLY. MUST ship with mitigations: per-run cap ≤50 filing events; `provenance.lane='filing'` advisory opt-in (off by default in `loadCanonical`); re-verify `isProtectedPath/isPinned/isSettled` at emit; closed-enum `object.zone ∈ CANONICAL_ZONES ∪ {EPHEMERAL,unclassified}` or reject. PIN live-store paths in `PINNED_ANCHORS` (declare, don't relocate — memory files are dynamic state). Add `_SYSTEM/backups` ZONE_RULE.

**Inc 7 — Persistence sweep (minimax+nemotron, DISARMED).** `memory-persistence-sweep.mjs` (two-flag AND like `armedState`): hot tar.zst post-drain + daily; warm rsync→external; cold `git bundle` of canonical.jsonl+read-view (durability floor — survives disk wipe, the #1 risk); `SHA256SUMS` via `atomicWriteFile`; run-ledger; single-persister `nano-lease`. Restore CLI: `restore --from <tarball|bundle>` → validate sums → re-stage shards → `drainOnce` rebuilds view.

**Inc 8 — Demote-to-subconscious bridge (nemotron, append-only).** New `kind:'demote'` event (supersedes last-active, lifecycle:subconscious) on a `system--staleness.jsonl` shard; `foldCanonical` marks `status:subconscious` (excluded from MEMORY-ACTIVE spine, still in canonical = truth preserved); re-promote via new assert superseding the demote. No deletion, no overwrite.

## OWNER GATES / OPEN
- Arming the live store needs: Inc 5 all-green + off-disk backup (Inc 7) automated + owner two-flag arm.
- `num_predict` policy (owner question 2026-06-14): keeping 250k ceiling (effectively unbounded; deleting risks truncation). nemotron capped 65536 → `--reasoning medium`.
- 3-dir memory drift (open decision #1) — canonical store resolves it at P6; until then projection targets the 241-file `.claude/memory` only.

## NEXT ACTION
Build Inc 1 (stream-read, pure refactor, 9 tests stay green) → Inc 2 (generation rotation + test). These are the correctness+scale core; the rest layers on.
