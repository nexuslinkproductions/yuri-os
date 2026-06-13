# NANO SWARM Session Retrospective — 2026-06-13 (HIGH PRIORITY · RESUME ANCHOR)

The session that designed + began building the NANO SWARM autonomous-lane fabric. This is the open-pool, pick-up-immediately surface. Companion docs: `nano-swarm-fabric-design-2026-06-13.md` (the locked design), `autonomous-run-2026-06-13.md` (the per-cycle log), memory `proj-nano-swarm-fabric-2026-06-13`.

## RESUME HERE (do this first next session)

Stack is **~135 tests green** + the durable multi-process I3 regression. Phase 0 (loop+observability), Phase 1 (500k gate, disarmed+unwired), G1 (lease registry), **Phase 3 (rotation + supervisor + fragment-assemble)** all DONE and red-team-hardened (3 Opus agents, real multi-process harnesses — see Phase 3 section below). Decisions LOCKED: native cron · lease-root = kagami guarded API · cost track-only-no-cap · fragment+assemble.

**Next, in order:**
1. **G4 — external nanos through `llm-lane`** (NOT raw `mimo.mjs`): llm-lane already gives the 24-iter agentic loop + spine preamble + the SAME safety core + energy trace. Work = route nanos through it + harden its *lexical* extra-rules (git-mutation/protected-surface) to realpath/closed-set. Egress for codex/deepseek is a separate environment fix. **This is the last structural gap before a real multi-nano run.**
2. **Arm the supervisor cron** — spec written + disarmed at `_SYSTEM/AGENTS/swarm-supervisor-cron.md`. Owner picks launchd (recommended, session-independent) or native Claude cron. Run `kagami-swarm-supervisor.mjs once` by hand first to confirm a clean `{ok:true}` cycle.
3. **Arm the compact gate** — only after a metrics-only burn-in confirms a live token signal in the PreToolUse payload (existing PreToolUse hooks read only `tool_name`/`session_id`; `context_window.used_percentage`/`transcript_path` confirmed in statusLine+Stop, NOT yet PreToolUse). Register in settings.json → watch `~/.yuri-audit.log` for real `would_deny` → flip `YURI_NANO_COMPACT_ENFORCE=1`.
4. **Wire fragment+assemble into a real multi-nano doc run** when shared-doc output work arises (`nano-doc-assembler.mjs` is built + tested; just needs a live consumer).

## Phase 3 — rotation + supervisor + assembler (2026-06-13, red-team-hardened)

**Built:** segmented event-log rotation + bounded segment-skip reads (`kagami-event-bus.mjs`), the swarm supervisor = singleton-leased reaper + rotator + liveness monitor (`kagami-swarm-supervisor.mjs`, composes nano-lease + event-bus; nano deaths recorded as `LEASE_EXPIRED` on the bus, NOT in the model-lane quarantine ledger — clean separation), and fragment+assemble (`nano-doc-assembler.mjs`, anti-clobber by construction: per-section fragment files, no shared RMW). Cron spec at `_SYSTEM/AGENTS/swarm-supervisor-cron.md` (disarmed).

**3 Opus red-team agents (real multi-process harnesses in /tmp) found 3 real bugs — all fixed + re-proven:**
- **I3 (BLOCK) — concurrent-rotation double-seal:** two rotators computed the same `events.NNNNNN.jsonl`; `renameSync` REPLACES the dest, silently destroying ~45% of events. My comment "rename is the serialization point / safe regardless" was FALSE (rename serializes on the source inode, not the dest name). Fix: reserve the dest with `openSync(dest,'wx')` (O_CREAT|O_EXCL) before rename; a racer gets EEXIST → `seq-reserved` bail. Re-proven: LOSS=0 under 8 rotators + durable regression test `nano-rotation-concurrency.test.mjs`.
- **I2b (HIGH) — reader ENOENT crash:** `parseSegmentFile`'s `existsSync`+`readFileSync` TOCTOU on the active file threw ENOENT (rotation in the window) and crashed the reader. Fix: read directly, swallow ENOENT → []; the `withStableSegments` retry (bumped to 8) re-lists. Re-proven: 0/5 crashes.
- **K2 (HIGH) — lease double-acquire:** `acquireLease`'s reclaim path destroyed a dir UNCONDITIONALLY after a dead-verdict; a concurrent fresh LIVE claim got destroyed + re-granted (two owners + lost updates). Fix: dead-only teardown re-evaluated UNDER CUSTODY (pre-check live → don't disturb; stage → re-read → destroy only if dead-now, else restore). Re-proven: `ownerNotUsAtWin` 17→0, lostUpdates 908→0/2. **Residual = the cooperative-lease floor** (a 3-way reclaim/claim eviction is unremovable on a plain POSIX FS w/o a lock manager); NEVER a double-owner; the realistic nano-tick path (distinct shards, yield-on-contention) is provably 0.

**Order-effect frame paid off:** thinking in non-commutation surfaced a 4th bug BEFORE the red-team — read∘rotate ≠ rotate∘read (a read listing `[active]` then parsing it after a rotation renamed it away → missed the new sealed segment). Fixed with the snapshot-stable read; quantum-sim corroborated (order-effect 1.0 pre-fix → 0.0 post-fix). Reaper agent self-overturned a false-BROKEN (harness artifact: renewer exited before the supervisor window — the reap was correct). Lesson: a multi-process harness can manufacture a false positive at the process-lifetime boundary.

## What worked (keep doing)

- **Agentic red-team is the verification, not a nicety.** 3 Opus refute-by-default nanos (writing real /tmp harnesses) found a **BLOCK-level concurrency race + 6 more bugs** that 47 green self-tests + mutation-tests were structurally blind to. For concurrency / enforcement / safety primitives, an independent adversarial agent is mandatory — unit tests cannot model cross-process races, same-ms timestamps, or poison return values.
- **Verify-before-trust, applied to EVERYONE (me, the planning fleet, the red-team agents).** It killed the planning fleet's headline "Truth 2" (external lanes blind — Marcel challenged it, llm-lane already wires the guards), and it EXTENDED an agent's finding (the compact-gate "0"-threshold brick; I found the tokens path had the same negative-value bug the agent missed).
- **Plan→ground→simulate→refine→build→self-verify→red-team→mutation**, with a Workflow fleet for the hard planning (43 max-reasoning agents → 8 architectures + 24 adversarial attacks proved the 2 design-defining truths).
- **Enforcement shipped SAFE:** disarmed + unwired + scoped-to-nano + fail-open + dual-arm + metrics-only burn-in. A deny-hook never bricked anything because it couldn't run until deliberately armed.

## What to AVOID (cost us, or nearly did)

- **Shipping a concurrency primitive on self-tests alone.** `nano-lease` passed 9 green self-tests while its keystone exactly-one-winner invariant was BROKEN (8 simultaneous winners under real process contention). Self-tests are single-threaded and cannot race.
- **A test that "passes" while testing the wrong thing.** My first cross-process race regression had instant-exit workers → it measured crash-reclaim, not contention (3 "winners"). A held-lease worker is the correct mutual-exclusion model. Always ask what a green test actually proves.
- **Conflating two roots.** `nano-refresh` passed the *event-bus root* as the *git cwd* (caught only by the 2-nano e2e — `fatal: not a git repository`). Distinct concepts need distinct params.
- **A wrong fix that looks right.** My first circular-result fix (`clip` total) was incomplete — the raw result still leaked into the HANDOFF payload via a shared helper. The mutation/regression test caught it. Fix the WHOLE path, then prove it.
- **The pipe artifact.** Piping a node lane's stdout injected a bare `AggregateError` → I treated a healthy mimo lane as dead for cycles. Redirect node lanes to a file; never pipe.
- **Truthy footgun values.** `"0"`/negative env thresholds were truthy and became deny-everything traps. Parse to positive-finite or disable.

## What to HARDEN (durable rules promoted from this session)

- **Concurrency/enforcement code → mandatory independent agentic red-team + a real multi-process test** before "done." (banked: [[feedback-agentic-red-team-finds-what-self-tests-miss]])
- **Hooks fail-OPEN on their own errors / missing telemetry** (never brick); the **fail-CLOSED** check belongs at the restartable tick boundary, not the per-tool hook.
- **Atomic FS claim = owner-included rename**, never mkdir-then-write (no empty-owner window). `holderAlive = pidLive AND fresh` (pid-reuse can't wedge). Release fail-CLOSED on null owner. Age-sweep staging orphans.
- **ISO-ms is not an ordering key** at append speed (~88% same-ms collisions under burst); use positional cursors, apply timestamp filters only as a rotation fallback.

## Session inventory (what shipped, all uncommitted at halt → being committed now)

NEW: `_lib/fs.mjs`(+test), `local-concurrency.test`, `kagami-event-cursor.test`, `nano-refresh`(+test), `nano-tick`(+test, +lease.test), `nano-compact-gate.mjs`(+test) + `.claude/hooks/nano-compact-gate.js`, `nano-lease`(+test); design+retro reports; skills `cross-reference-navigation` + `quantum-hypothesis-simulation` (+ `/xref` `/quantum-sim` `/qsim` commands); several Track-B memories.
MODIFIED: `kagami-event-bus.mjs` (readKagamiEventsSince), `kagami-control-domain.mjs` (LEASE_* kinds), `quantum-hypothesis-tracker.mjs` (@capability), `mechanism-pattern-registry`(+test), `propagation-scan`(+test), 9 `_lib/fs` migrations, `capabilities.json`, `MEMORY.md`.
