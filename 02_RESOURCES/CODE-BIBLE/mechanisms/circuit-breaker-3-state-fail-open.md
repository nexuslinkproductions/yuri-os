# Mechanism Card — circuit-breaker-3-state-fail-open

> CLOSED / OPEN / HALF_OPEN with a bounded cooldown and an anti-stuck auto-escape. A safety breaker must never be able to permanently brick the thing it protects.

| field | value |
|---|---|
| **slug** | `circuit-breaker-3-state-fail-open` |
| **source** | IN-REPO clean-room transfer (resilience4j / Hystrix / Polly → YURI gate) — `_SYSTEM/Scripts/energy-breaker.mjs` |
| **anchor** | `evaluateGate` @ `energy-breaker.mjs:144`; `transitionOnVerdict` @ `:108`; `normBreaker` @ `:54` |
| **license** | internal (YURI-OS); pattern lineage resilience4j (Apache-2.0, permissive concept) |
| **lane** | js (Rust: an enum-state breaker with `Instant` timers; same three states + auto-escape) |
| **YURI use** | layer-2 defense-in-depth over the work-dynamics energy gate — trips on a catastrophic non-offsettable verdict, fails open on any data gap |

## Mechanism (one line)
A pure state machine over a TRAILING verdict: a single catastrophic event trips CLOSED→OPEN; OPEN denies for a bounded cooldown then probes (OPEN→HALF_OPEN); a clean probe recovers (HALF_OPEN→CLOSED); and a HALF_OPEN that overstays its dwell AUTO-ESCAPES to CLOSED so the breaker can never stick. Every data gap fails OPEN as a CLEAN verdict (no trip) because it is a backup layer, not the primary floor.

## Algorithm (the idiom, distilled)
1. **Frozen state set + state-machine constants** — `BREAKER_STATE = Object.freeze({CLOSED, OPEN, HALF_OPEN})` (`energy-breaker.mjs:27`); cfg is env-overridable standards, not law (`:32-47`).
2. **Coerce any persisted blob to a valid breaker, fail-open** — `normBreaker` (`:54-74`): garbage → `freshBreaker()` (CLOSED); an OPEN/HALF_OPEN state WITHOUT a trustworthy positive timestamp is distrusted and reset to CLOSED (`:62-63`) so a corrupt timing field can't freeze a block.
3. **Trip only on catastrophe, from ANY state** — `isCatastrophic` = `protectedPathVeto || structuralFloorVeto` (`:98-100`); `transitionOnVerdict` sets OPEN on a single such event (`:115-121`). Soft ascending-ΔU is advisory STEER only, never a trip (`:185-194`) — keeps false-positives ~0.
4. **OUTCOME transition (PostToolUse)** — `transitionOnVerdict` (`:108`): catastrophe → OPEN; HALF_OPEN + clean accept → CLOSED (`:122-128`); else unchanged, rolling the steer band. Pure, never mutates input.
5. **TIME transition (PreToolUse)** — `evaluateGate` (`:144`) returns `{decision, reason, breaker}` where decision ∈ `allow|deny|probe|steer`:
   - OPEN within cooldown → **deny** (fail-fast) (`:166-170`).
   - OPEN, cooldown elapsed → **probe** (OPEN→HALF_OPEN) (`:158-164`).
   - HALF_OPEN within dwell → **probe** (`:182`).
   - HALF_OPEN, dwell exceeded → **allow** + AUTO-ESCAPE to CLOSED (`:175-181`).
   - CLOSED with ascending ΔU → **steer** (advisory) (`:188-194`); else **allow**.
6. **Caller owns enforcement** — `evaluateGate` only RECOMMENDS `deny`; the hook decides whether deny blocks or is metrics-only. Always returns the advanced breaker so the caller persists state.

## When to apply
- Any repeated operation guarded by a verdict that can be catastrophic but is computed out-of-band (trailing) — wrap it so one bad event fail-fasts the next N, then self-heals.
- Any safety/rate gate where a permanent-block bug would be worse than a missed catch — give it a bounded cooldown AND a HALF_OPEN auto-escape.
- Any breaker reading state from disk/JSON that an attacker or clock skew could corrupt — normalize-and-fail-open the persisted blob first.

## The failure it prevents
- **"Stuck in HALF_OPEN" (the documented #1 breaker failure).** A probe that never resolves leaves the breaker half-open forever. The `dwell > maxHalfOpenMs` auto-escape (`:175-181`) guarantees recovery — the breaker cannot permanently brick the session.
- **Permanent OPEN via clock skew / tampered timestamp.** If `openedAt` is in the future, `elapsed` is negative; a strict `elapsed >= wait` would DENY FOREVER (the OPEN-state cousin of stuck-HALF_OPEN, found via the disclosed bug-bounty business-logic cross-ref). `elapsed < 0` is treated as ready-to-probe (`:151-158`): fail toward recovery, never toward a permanent block.
- **Corrupt-state freeze.** An OPEN/HALF_OPEN persisted with no valid timestamp can't have its cooldown computed; `normBreaker` distrusts it and resets to CLOSED (`:62-63`) rather than leaving an uncomputable block.
- **Backup-layer false catastrophe.** A thrown gate (malformed states) in a defense-in-depth layer should not invent a catastrophe; `verdictFromStates` catches and returns a CLEAN verdict (`:81-95`), and `evaluateGate` fails open on any gap — the deterministic primary floor still guards.
- **Steer-noise tripping.** Treating soft ΔU ascent as a trip would flood false-positives; it is advisory `steer` only (`:185-194`).

## Clean-rewrite note
Pattern lineage is resilience4j/Hystrix/Polly (Apache-2.0 concepts, safe to transfer). The structural mismatch resolved here (`:12-17`): resilience4j wraps the SAME call it measures; YURI's verdict is TRAILING (computed PostToolUse, read PreToolUse), so the "probe" is the next real tool call judged at ITS PostToolUse — keep that framing when porting. In Rust use an enum state + `Instant` deltas; preserve the negative-elapsed fail-toward-recovery and the HALF_OPEN auto-escape — they are the anti-brick guarantees, not optional polish.

## Verification
Real source read (not from memory). Grep-verified path:line in this repo:
- `energy-breaker.mjs:27` `BREAKER_STATE = Object.freeze({ CLOSED, OPEN, HALF_OPEN })`
- `energy-breaker.mjs:62-63` corrupt-timestamp OPEN/HALF_OPEN → CLOSED (fail-open)
- `energy-breaker.mjs:108` `transitionOnVerdict` (outcome-driven, pure)
- `energy-breaker.mjs:144` `evaluateGate` (time-driven, returns decision + advanced breaker)
- `energy-breaker.mjs:158` `if (elapsed < 0 || elapsed >= c.waitDurationMs)` clock-skew fail-toward-recovery
- `energy-breaker.mjs:175` `if (dwell > c.maxHalfOpenMs)` HALF_OPEN anti-stuck auto-escape
