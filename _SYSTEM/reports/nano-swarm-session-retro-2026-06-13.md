# NANO SWARM Session Retrospective — 2026-06-13 (HIGH PRIORITY · RESUME ANCHOR)

The session that designed + began building the NANO SWARM autonomous-lane fabric. This is the open-pool, pick-up-immediately surface. Companion docs: `nano-swarm-fabric-design-2026-06-13.md` (the locked design), `autonomous-run-2026-06-13.md` (the per-cycle log), memory `proj-nano-swarm-fabric-2026-06-13`.

## RESUME HERE (do this first next session)

Stack is **61 tests green** (cursor 9 · refresh 9 · tick 9 · tick-lease 5 · compact-gate 16 · lease 13) + event-bus no-regression. Phase 0 (loop+observability), Phase 1 (500k gate, disarmed+unwired), G1 (lease registry) DONE and red-team-hardened. Decisions LOCKED: native cron · lease-root = kagami guarded API · cost track-only-no-cap · build approved · fragment+assemble.

**Next, in order:**
1. **Supervisor** — `kagami-overseer` needs a driver + reaper (it's a passive library today; nothing ticks it). Wake nanos via native cron self-renewal; reap stale leases (`reclaimLeases`) + record crashes.
2. **Event-log ROTATION** — the universal scale risk every architecture flagged: `events.jsonl` + lease state replay is O(file) per tick; **must land before >6 nanos** or the swarm self-strangles. Add `readKagamiEventsSince` offset-index + a rotation/snapshot pass.
3. **G4 — external nanos through `llm-lane`** (NOT raw `mimo.mjs`): llm-lane already gives the 24-iter agentic loop + spine preamble + the SAME safety core + energy trace. Work = route nanos through it + harden its *lexical* extra-rules (git-mutation/protected-surface) to realpath/closed-set. Egress for codex/deepseek is a separate environment fix.
4. **Arm the compact gate** — only after a metrics-only burn-in confirms a live token signal in the PreToolUse payload (existing PreToolUse hooks read only `tool_name`/`session_id`; `context_window.used_percentage`/`transcript_path` confirmed in statusLine+Stop, NOT yet PreToolUse). Register in settings.json → watch `~/.yuri-audit.log` for real `would_deny` → flip `YURI_NANO_COMPACT_ENFORCE=1`.
5. **fragment+assemble** assembler when shared-doc multi-nano output work arises.

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
