# 04 — SHIP RECORD + COMMERCIAL ROADMAP

> Final artifact of the GitHub-adoption mission (`00-MASTER-BRIEF.md`). What shipped to main, armed states, verification evidence, and the owner-arming decisions that gate full commercial enforcement.
> **Everything is in main's working tree, UNCOMMITTED.** Commit authority is Marcel's. No push.

## SHIPPED (6 items, all verified on main)

| Item | What it adds | Armed state | Tests | Touches |
|------|--------------|-------------|-------|---------|
| **firmware-policy** | Failure-anchored skill rules (`@anchor`), anti-rationalization → writing-skills, +3 prose axes, countable design AI-tell catalog | policy (live) | docs, self-slop-corrected | skill-creation.md, ai-slop-catalog, design-principles.md |
| **skill-security-gate** | 16-cat taxonomy + JS-native AST + taint + OSV (offline snapshot) + SARIF + foreign-skill install verdict | **advisory** (no auto-block) | 14/14 | corpus-security-scan.mjs + 6 new security modules |
| **staleness-extension** | Per-file content-hash staleness + live banner in xref-query + provenance-tagged heuristic edges | active | 66/66 | xref-drift-scan/query/provenance.mjs (3-way merged w/ main's queryInvariant) |
| **ccr-compression** | Reversible compress/retrieve (cache + sentinel) + cache-prefix volatility detector | active (lossless default) | 73/73 | new ccr-compress.mjs + cache-prefix-scan.mjs; compact-optimizer SKILL.md note |
| **cost-admission-gate** | Cost-to-completion reservation + exported ledger math + release/reacquire primitive | **DISARMED** (dual-arm + no cap set) | 18/18 (+ token-ledger regression green) | cost-reservation-pool.mjs; token-ledger/llm-lane/yuri-slm-worker.mjs |
| **human-review-sublane** | Optional HITL plan/diff review, mutual-exclusion w/ plan_dispatch_gate at 3 sites | **advisory** (emitWarnings, not emitBlock) | 19/19 | plan-review.mjs + SKILL/command; claude-protocol-guard + post-tool-use (3-way merged) |

**Verification evidence:** 173 tests green (0 fail) · `capability-scan --check` = OK (39 capabilities) · skill-hash drift=0 unregistered=0 (240) · 0 conflict markers in any installed file · all live hooks + new modules parse · xref-query smoke shows the staleness banner live.

## INTEGRATION METHOD (recorded for reuse)

Built in 5 isolated git worktrees (parallel, no collision, no auto-commit), then integrated to main sequentially: **new files copied; clean-on-main files copied; main-dirty files 3-way-merged via `git merge-file`** (preserving main's uncommitted in-flight work — notably `queryInvariant` in xref-query, which overlapped staleness and needed hand-resolution of 4 union conflicts). `capabilities.json` regenerated ONCE on main (never per-worktree — worktrees lagged main's full capability set and would have clobbered 11). Each item's tests re-run on main post-integration.

## OWNER DECISIONS — gate full enforcement (nothing blocks until you decide)

1. **cost-admission cap.** DISARMED until you set a real budget cap (USD) + window semantics + free-lane exemption + over-estimate multiplier, then arm via `YURI_COST_ADMISSION_ENFORCE=1` + flag file. A missing cap fails OPEN by design.
2. **human-review behavior.** Advisory pacing now. To make it a real R4 enterprise hard-gate (changes-requested blocks the next mutation), you decide: hard-block vs advisory, and whether there's a real human at the PTY. Hard-block fights continuous-PTY autonomy.
3. **skill-security auto-block.** Advisory now (corpus-absorb still keys legacy verdict). Flip to auto-block-on-ingest when you want the install gate to actually refuse a DO_NOT_INSTALL skill.

## RESIDUAL RISK (honest)

- **Forward-wiring, not live (disclosed):** `heuristicEdge` provenance has no live energy-gate consumer yet (schema seam); cost `reacquireWithRollback` has no live multi-step caller; human-review `annotatePlan` has no hook caller; SARIF emitted-but-unconsumed (no CI surface). All labeled in-code as forward-wiring — not sold as live fixes.
- **Hand-rolled JS/TS lexer** (skill-security) is a token-aware detector, not a full ECMAScript parser — degrades to regex, but a determined obfuscator could evade specific call shapes. Highest correctness-risk surface.
- **Taint model** is intra-file co-occurrence (heuristic confidence), not true def-use.
- **OSV snapshot** is a small curated set; `--osv-online` is opt-in.
- **5 worktrees persist** at `.claude/worktrees/wf_ebf5e7d0-362-{1..5}` as rollback provenance — `git worktree remove` them after you've reviewed the integration.

## COMMERCIAL-READINESS STATUS

The verification-as-infrastructure moat (mimo's framing) is now materially stronger: foreign-skill security verdict, reversible token economics, cost admission, index-freshness honesty, optional human review. The launch-blocker (no install-time skill security) is addressed (advisory; flip to enforce on your word). The remaining commercial gates are owner-arming decisions, not engineering gaps.

## ARMING APPLIED (2026-06-13 closeout — commit 6eb0df06)

Owner directed the arming at session close ("arm it, keep both advisory" → refined to: cost advisory, human-review auto-block):
- **cost-admission-gate → ARMED ADVISORY.** `_SYSTEM/state/cost-admission.armed` JSON `capUsd=50/day` (PLACEHOLDER — tune to real economics), warn-only (NO `YURI_COST_ADMISSION_HARDBLOCK`); `YURI_COST_ADMISSION_ENFORCE=1` added to `~/.config/yuri/env.sh` for durable advisory activation. Never hard-blocks.
- **human-review-sublane → AUTO-BLOCK with reason.** `checkPlanReviewGate` now returns `block:true`; the `claude-protocol-guard` handler `emitBlock`s any `block:true` finding (requires `CLAUDE_SESSION_ID`, degrades to WARN absent). Per-attempt auto-open removed; TTL failsafe kept. Fires ONLY in opt-in review mode (default OFF) — autonomous sessions unaffected. Verified: hook parses, review-OFF flow does not block, 19/19 tests.
- **skill-security stays ADVISORY** (auto-block-on-ingest remains a future owner flip).
- Both commits pushed to `origin/main` (536b28f8 build, 6eb0df06 arming). `ai reindex` (41,655 docs) + GitNexus refresh (53,580 nodes) done. EOT closeout ran.

Still optional/yours: tune the cost capUsd; flip skill-security auto-block; `git worktree remove` the 5 rollback worktrees.
