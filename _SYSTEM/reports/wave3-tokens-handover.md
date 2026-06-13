# YURI Wave-3 Session Tokens Domain — Handover Instruction for Opus 4.8

> **Operator note (Marcel):** paste this file's path into the Opus session as the task packet root. No blocking owner decisions for Phase 1-3; D-T1 (context-% measurement) gates Phase 4. Status: **PACKAGES READY — Codex addendum blocked until Jun 11 credits reset; re-dispatch `_SYSTEM/reports/wave3-codex-spec-saved.md` after reset.**

---

## 0 · Mission

You are fixing the YURI session-tokens domain so that spend reporting is accurate, context-% measurement is live (not stale), and the token ledger lifecycle is honest. A completed audit + attack pass (10/10 CONFIRMED, 0 refuted) found: **all Claude/Anthropic spend reports as $0.000000 (no pricing key); DeepSeek pro cost underestimated 4x (discount key expired May 31); the auto-compact tier mechanism reads a frozen context% that can never reflect the current session; session-end events are labelled `observed_transcript` but carry hardcoded zero tokens.**

Non-negotiable framing: the spend-report is Marcel's financial visibility into YURI operation. Reporting Claude cost as $0 is not a cosmetic bug — it makes every cost analysis wrong. Fix the pricing and discount issues first; the stale-context mechanism second.

**Completeness contract:** every attack-confirmed finding in the audit ledger appears exactly once below as a workpackage or an explicit PARKED entry.

**Document map:**
- `_SYSTEM/reports/wave3-tokens-audit.md` — primary audit + ATTACK PASS. 10/10 CONFIRMED.
- `_SYSTEM/lane-output/deepseek-wave3-token-stack.md` — DS advisory; most claims confirmed; queue size/hash chain claims UNVERIFIABLE read-only but mechanisms confirmed. [DS-verified where confirmable]
- This file — the work program.

---

## 1 · Context loadout

1. `CLAUDE.md` (repo root)
2. `_SYSTEM/reports/wave3-tokens-audit.md` — read FINDINGS + ATTACK PASS fully
3. This file, fully
4. Per phase: target files listed in each phase's workpackages — read each fully before editing

Run `node _SYSTEM/Scripts/xref-query.mjs "token ledger spend report context compact"` once at session start.

---

## 2 · Hard rules

- **No commit, no push.** Marcel holds commit authority.
- **Protected paths untouchable**: `backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`. The `token_policy_versions` table is in `memory.db` (`.claude/state/` boundary) — do NOT read or write memory.db directly; use the ledger's own API.
- **No dependency installs. No destructive commands. Never `claude -p`/`--print`/SDK.**
- **Scope discipline:** edit ONLY files named in the workpackage you are executing.
- **Evidence discipline:** every fix ends with its acceptance command run and output captured.
- **Owner-decision boxes** (marked `🔶 OWNER`): implement recommended default ONLY if Marcel pre-approved in the packet.
- **models.json:** write changes to `.claude/config/models.json` only. Do NOT edit `token-ledger.mjs` pricing constants unless the fix requires it (prefer the config file fix route for CRIT-1 and CRIT-2).
- **DB access:** `_SYSTEM/OS_KERNEL/memory.db` is the token-ledger DB (confirmed: `token-ledger.mjs:23 DEFAULT_DB_PATH`). It is also the memory-governor DB (co-tenant). Do NOT run DDL against it. Schema changes go through `token-ledger.mjs`'s own schema path only.

---

## 3 · Working agreement

- **One phase per work block.**
- **DS advisory verdicts:** queue-size (9.3MB, 1190+ files) and hash-chain break (seq 112487) are UNVERIFIABLE read-only. Accept as probable; note `[DS-UNVERIFIED]` in your session report for these two specific claims. All other DS token-stack claims CONFIRMED.
- **HIGH-1 nuance:** `token-status.js` is wired as both a `Stop` hook AND a `statusLine` hook (settings.json:330). The `statusLine` event provides `context_window.used_percentage` in real-time, but `token-status.js` does not read `context_window` from the statusLine input — it reads the transcript file. The stale-context.pct conclusion is confirmed. The fix (WP-T.3) should leverage the `statusLine` input path to write real-time `context.pct`.
- **End of session report:** changed files, every command run with pass/fail, owner-decision items left open.

---

## 4 · Fix phases

### Phase 0 — Baseline freeze

```bash
node _SYSTEM/Scripts/token-spend-report.mjs 2>&1 | head -20
# Should show $0 for Claude calls — this is the bug we're fixing
grep -n "deepseek_v4\|anthropic\|claude" .claude/config/models.json | head -20
grep -n "loadPricing\|estimateCost\|pricingByModel" _SYSTEM/Scripts/token-spend-report.mjs | head -15
```
Any unexpected failure before you start → stop, report, wait.

---

### Phase 1 — Spend report pricing: Claude cost $0 fix (blocking financial accuracy)

**WP-T.1** [CRITICAL] [CONFIRMED: audit CRIT-1] `loadPricing()` reads only DeepSeek config — all Claude/Anthropic spend reports as $0

- **Files:** `_SYSTEM/Scripts/token-spend-report.mjs:51-73` (`loadPricing()` function), `.claude/config/models.json`
- **Evidence:** [audit CRIT-1, CONFIRMED]. `loadPricing()` reads exclusively from `config.deepseek_v4`. `models.json` has no `anthropic` or `claude` section. `pricingByModel` populated only with DeepSeek entries. `estimateCost()` returns 0 on `!pricing`. Correct Claude pricing IS in `token-ledger.mjs:65-67` `DEFAULT_POLICY.pricing_per_million` — it was never wired to spend-report.
- **Direction:** Add an `anthropic` pricing section to `.claude/config/models.json`. Populate with the current Claude model pricing from `token-ledger.mjs:65-67` as the authoritative source. Then update `loadPricing()` to also read `config.anthropic` (or `config.claude`) and merge entries into `pricingByModel`. The merge key should be the model ID string (e.g. `claude-sonnet-4-6`, `claude-opus-4-7`). Do NOT duplicate the pricing constants — read them from ONE source. If the `token_policy_versions` table in the DB (where `token-ledger.mjs` writes `pricing_json`) is accessible without hitting the protected-path boundary, that is the preferred live source. Otherwise, read from `token-ledger.mjs:65-67` constants and add them to `models.json`.
- **Acceptance:** `node _SYSTEM/Scripts/token-spend-report.mjs 2>&1 | grep -i "claude\|sonnet\|opus"` returns non-zero cost estimates for Claude calls (if any Claude calls are in the ledger). `grep "anthropic\|claude-sonnet\|claude-opus" .claude/config/models.json` returns the new pricing entries.
- **Regression:** only adds a new pricing section; does not touch the DeepSeek path. Existing DeepSeek cost reporting unchanged.

---

### Phase 2 — Spend report pricing: DeepSeek pro discount expired

**WP-T.2** [CRITICAL] [CONFIRMED: audit CRIT-2] `token-spend-report.mjs` uses `pro_discounted_until_2026_05_31_15_59_utc` key — discount expired 10 days ago, cost underestimated ~4x

- **Files:** `_SYSTEM/Scripts/token-spend-report.mjs:65`, `.claude/config/models.json`
- **Evidence:** [audit CRIT-2, CONFIRMED]. `pricing.pro_discounted_until_2026_05_31_15_59_utc` resolves to the discounted rate (cache_miss_input=0.435, output=0.87). Post-expiry list price is `pro_list_price` (cache_miss_input=1.74, output=3.48) — 4x higher. Today is 2026-06-10, 10 days post-expiry.
- **Direction:** Change `token-spend-report.mjs:65` to use `pricing.pro_list_price` instead of `pricing.pro_discounted_until_2026_05_31_15_59_utc`. The `pro_list_price` key is confirmed present in `models.json:87`. Optionally: add an expiry-check utility that reads the discount-key name, parses the date suffix, and automatically selects the discount vs list-price key based on `Date.now()`. This future-proofs against the next discount period without requiring a manual code change.
- **Acceptance:** `grep "pro_list_price\|pro_discounted" _SYSTEM/Scripts/token-spend-report.mjs` returns only `pro_list_price` reference (no `pro_discounted` reference). Re-run spend report and confirm DeepSeek pro cost is ~4x higher than before.
- **Regression:** DeepSeek flash pricing unchanged. Only the `pro` pricing key changes.

---

### Phase 3 — Session-end ghost zero-token event: honest labelling

**WP-T.3** [HIGH] [CONFIRMED: audit HIGH-2] Session-end event carries hardcoded zero tokens but labels itself `observed_transcript` / `exact_transcript`

- **Files:** `.claude/hooks/token-session-end.js:68-80`
- **Evidence:** [audit HIGH-2, CONFIRMED]. `input_tokens: 0, output_tokens: 0, cost_usd: 0` hardcoded. When `realTokens > 0`, event labeled `measurement_type='observed_transcript'` and `accuracy_class='exact_transcript'`. The real token data is in `metadata.real_tokens` only.
- **Direction:** Two options: (a) **Honest labelling (recommended):** Change the `measurement_type` conditional: when `realTokens > 0` AND `input_tokens === 0`, emit `measurement_type: 'lifecycle_marker'` and `accuracy_class: 'unobservable_at_session_end'`. Add a comment: `// session-end hook cannot recover full token counts retroactively; real cumulative delta is in claude_transcript_delta events from token-status.js`. (b) **Wire real tokens:** assign `input_tokens: realTokens` (or the equivalent input split) to the event. This requires reading the token breakdown from `SESSION_FILE` — verify `parseTranscript`'s return shape to get the correct field. Option A is lower risk and immediately honest. Option B adds real data but requires verifying the SESSION_FILE parsing is accurate.
- **Acceptance:** `grep "lifecycle_marker\|unobservable\|exact_transcript" .claude/hooks/token-session-end.js` returns the new label. Re-run: audit queries grouped by `measurement_type='observed_transcript'` will no longer include zero-token rows.
- **Regression:** the session-end event is a lifecycle marker; downstream consumers checking `measurement_type` will see the new label. Confirm no consumer relies on `measurement_type='observed_transcript'` for exact token math (they should be using `claude_transcript_delta` events instead).

---

### Phase 4 — Context-% measurement: live signal for auto-compact 🔶 D-T1

**WP-T.4** [HIGH] [CONFIRMED: audit HIGH-1] `context.pct` is frozen stale during active sessions; auto-compact tier mechanism cannot fire on a live context reading

- **Files:** `.claude/hooks/token-status.js:78`, `.claude/settings.json` (hook registration), `.claude/hooks/pre-tool-use.js:81`
- **Evidence:** [audit HIGH-1, CONFIRMED + attack pass nuance]. `token-status.js` fires as `Stop` hook and as `statusLine` hook. The `statusLine` event carries `context_window.used_percentage` in its input data. However, `token-status.js` does NOT read `context_window` from statusLine — it reads the transcript file. So `context.pct` is frozen stale during active sessions regardless of the statusLine wiring. `pre-tool-use.js:81` reads the frozen value.
- **Two branches (owner resolves via D-T1):**
  - **Option A (build a real PostToolUse context probe — recommended):** In `token-status.js`, add a code path for the `statusLine` event type: if `input.context_window?.used_percentage` is defined, write `state.context.pct = input.context_window.used_percentage` to session-state. This leverages the existing statusLine hook registration (settings.json:330) and provides a real-time context% update on every turn. The `pre-tool-use.js:81` read will then see the turn's actual context%, making the auto-compact tier mechanism live. Low blast radius — adds ~5 lines to an existing hook.
  - **Option B (prose-only acknowledgement):** Add a comment to `pre-tool-use.js:81`: `// NOTE: context.pct is frozen stale during active sessions (written only by Stop hook + statusLine hook which reads transcript, not context_window). The auto-compact tier thresholds are prose-advisory only — no live context signal reaches this path. Manual /compact is the only reliable trigger.` Remove the tier-based compaction logic from `pre-tool-use.js` (or clearly mark it as advisory), and update `tokenmaxxing/SKILL.md` and `compact-optimizer/SKILL.md` to state the prose-only posture explicitly. This is honest but removes the automatic compaction signal entirely.
- **Acceptance (Option A):** `node -e "const s=require('./.claude/hooks/token-status.js')" 2>&1 || echo "ESM"` — then read the file to confirm the `statusLine` input path. Run a real session turn and verify `session-state.json context.pct` updates from the statusLine input.
- **Acceptance (Option B):** `grep "frozen stale\|prose-advisory" .claude/hooks/pre-tool-use.js` returns the comment. `grep "prose-only\|no live.*context" .claude/skills/tokenmaxxing/SKILL.md` returns the updated framing.
- **Regression (Option A):** statusLine fires every turn (it is a per-turn hook). Adding a `context_window.used_percentage` write on every turn means session-state is updated frequently — confirm no consumer depends on `context.pct` being stable within a turn.

---

### Phase 5 — Token budget check: reconcile heuristic vs real counters

**WP-T.5** [HIGH] [CONFIRMED: audit HIGH-3] `token-budget-check.js` and `token-status.js` use two irreconcilable token paths — heuristic estimates vs real transcript tokens

- **Files:** `.claude/hooks/token-budget-check.js:14`, `.claude/hooks/token-tool-logger.js:9-13`
- **Evidence:** [audit HIGH-3, CONFIRMED]. `token-budget-check.js` reads `estimatedTokens` (heuristic: Read=800, Bash=300, etc.) from `/tmp/claude-session-*.json`. `token-status.js` reads real transcript tokens separately. Never reconciled. Heuristic WARN at 80k fires independently of real context usage.
- **Direction:** Once WP-T.4 (Option A) is implemented, `session-state.context.pct` provides a real-time context% signal. Update `token-budget-check.js` to read `state.context.pct` (if > 60%) as its primary budget signal, falling back to the heuristic `estimatedTokens` counter if `context.pct` is 0 or stale (< 1 minute old). This aligns the budget warning with the real context window rather than the heuristic tool-call estimator. If WP-T.4 Option B is chosen (prose-only), leave this workpackage as a documentation fix: add a comment to `token-budget-check.js:14` explaining the heuristic nature and that the counter is not comparable to context window %.
- **Acceptance:** `grep "context\.pct\|context_window\|heuristic" .claude/hooks/token-budget-check.js` returns the updated logic or the clarifying comment.
- **Dependency:** WP-T.4 must be completed first (both options produce an output used here).

---

### Phase 6 — Detached spawn silent failure: queue-write fallback

**WP-T.6** [MEDIUM] [CONFIRMED: audit MED-1] Three hook sites spawn detached token-ledger child processes with silent failure on spawn error

- **Files:** `.claude/hooks/token-tool-logger.js:57-65`, `.claude/hooks/token-status.js:177-185`, `.claude/hooks/token-session-end.js:93-101`
- **Evidence:** [audit MED-1, CONFIRMED]. All three use identical pattern: `spawn + detached:true + stdio:ignore + child.unref()` wrapped in `try {} catch (_) {}`. Spawn failure → silent event loss. No retry. No fault file.
- **Direction:** In the `catch (_) {}` block of each of the three sites, add a fallback: write the event JSON to a local fault queue file. E.g.: `fs.appendFileSync(path.join(FAULT_DIR, 'spawn-failures.jsonl'), JSON.stringify({event, error: String(e), ts: Date.now()}) + '\n')` where `FAULT_DIR` is a directory that already exists (e.g. `~/.yuri/token-ledger/` which is confirmed present). Use a try/catch around the fault write itself (if even that fails, stderr is the last resort). This turns silent loss into observable queued failures.
- **DS advisory note:** DS claimed "9.3MB queue, 1190+ files, drain not keeping up" [DS-UNVERIFIED read-only — mechanism confirmed via MED-1; exact size unverifiable]. The fault-queue fallback in this fix does not add to the existing queue — it is for spawn-failures specifically.
- **Acceptance:** `grep "spawn-failures\|fault.*jsonl\|FAULT_DIR" .claude/hooks/token-tool-logger.js .claude/hooks/token-status.js .claude/hooks/token-session-end.js` returns fallback code in all three. Simulate a spawn failure (e.g. rename the ledger script temporarily) and confirm a fault entry is written.
- **Regression:** the catch block currently silently discards. Adding a fault write only changes the silent-discard to an observable-discard. No functional change to the happy path.

---

### Phase 7 — Low-severity hygiene

**WP-T.7** [MEDIUM] [CONFIRMED: audit MED-2] `tokenmaxxing/SKILL.md:39` references stale model version "Opus 4.8" — no such model exists in ledger or config

- **Files:** `.claude/skills/tokenmaxxing/SKILL.md:39`
- **Evidence:** [audit MED-2, CONFIRMED]. "Opus 4.8 reasons the fit" in SKILL.md:39. Canonical pricing row is `claude-opus-4-7`. No `opus-4-8` entry anywhere in models.json or DEFAULT_POLICY.
- **Direction:** Replace "Opus 4.8" with "Opus 4.7" (or remove the version pin entirely if the skill's meaning does not depend on the specific version). The change is injected into SessionStart context via `token-session-init.js:107` — keeping a false model ID in that injection pollutes every session's turn-1 context.
- **Acceptance:** `grep "Opus 4.8\|opus-4-8" .claude/skills/tokenmaxxing/SKILL.md | wc -l` returns 0.

**WP-T.8** [MEDIUM] [CONFIRMED: audit MED-3] Compact trigger thresholds inconsistent across three surfaces

- **Files:** `.claude/skills/compact-optimizer/SKILL.md:88,110`, `.claude/skills/tokenmaxxing/SKILL.md:33`, `.claude/hooks/pre-tool-use.js:14-27`
- **Evidence:** [audit MED-3, CONFIRMED]. compact-optimizer says 65%; tokenmaxxing says 60%; code (TM path) uses 60%, non-TM uses 65%. "40k transcript hard max" in compact-optimizer has no hook mechanism.
- **Direction:** Establish a single authoritative threshold: the code's TM threshold (60%) wins for tokenmaxxing sessions; 65% for non-TM. Update `compact-optimizer/SKILL.md:88,110` to say "Context bar >60% (tokenmaxxing mode) or >65% (standard mode): run /compact with hint." Remove the phantom "40k transcript hard max" from compact-optimizer SKILL.md (it has no corresponding hook mechanism — add a note: "(no hook enforces a transcript-line limit; this is a guideline for manual /compact invocation)"). Update `tokenmaxxing/SKILL.md:33` to say "When context hits tier 2 (60%+ in TM mode or 65%+ in standard mode), run /compact immediately."
- **Acceptance:** `grep "60%\|65%\|40k\|transcript.*max" .claude/skills/compact-optimizer/SKILL.md .claude/skills/tokenmaxxing/SKILL.md` — confirm the 40k hard-max phantom is replaced by a guideline note; threshold alignment matches code.

**WP-T.9** [LOW] [CONFIRMED: audit LOW-2] `spend-report` `resolveSourceTable` checks `recorded_at` first — dead branch, fragile on schema migration

- **Files:** `_SYSTEM/Scripts/token-spend-report.mjs:86`
- **Evidence:** [audit LOW-2, CONFIRMED]. Schema uses `created_at`; code checks `recorded_at` first (never present). Works via fallback but breaks semantically on future migration.
- **Direction:** Swap the column order: check `created_at` first, then `recorded_at`. Add a comment: `// schema uses created_at (token-ledger.mjs:324); recorded_at checked as fallback for potential future migration`.
- **Acceptance:** `grep "recorded_at\|created_at" _SYSTEM/Scripts/token-spend-report.mjs | grep timeColumn` returns `created_at` as the primary branch.

**WP-T.10** [LOW] [CONFIRMED: audit LOW-1] subagents inherit root session's stale `context.pct` via the `<4h guard` in `token-session-init.js`

- **Files:** `.claude/hooks/token-session-init.js:46-50`
- **Evidence:** [audit LOW-1, CONFIRMED]. `if (existing?.status === 'active' && (Date.now() - ...) < 4 * 3600 * 1000) throw new Error('skip')` — subagent skips re-init, inherits root's frozen context.pct. Confirmed as a documented design choice.
- **Direction:** Documentation only. Add a comment at lines 46-50: `// DESIGN CHOICE: subagents within 4h of root session inherit root's session-state (including context.pct). // context.pct is frozen stale for subagents (they have their own context window but no Stop-hook token-status fires for them). // This is acceptable — subagents are bounded tasks; their context% is implicitly low at dispatch.`
- **Acceptance:** `grep "subagents.*4h\|DESIGN CHOICE" .claude/hooks/token-session-init.js` returns the comment.

---

## 5 · PARKED entries

| ID | Finding | Reason parked |
|---|---|---|
| PARKED-T.A | DS claim: 9.3MB queue / 1190+ files / drain not keeping up [DS-UNVERIFIED] | Mechanism confirmed (detached spawn = silent loss, fixed by WP-T.6). Queue size and drain rate require timed observation — not verifiable read-only. If queue is genuinely 9.3MB / 1190+ items, Marcel should run `ls ~/.yuri/token-ledger/queue/ | wc -l` and decide whether to manually drain or wipe the queue. Parked until Marcel observes queue state. |
| PARKED-T.B | DS claim: hash chain broken at seq 112487 [DS-UNVERIFIED] | `token-ledger.mjs:verifyHashChain` mechanism confirmed structurally sound. Exact sequence_id break cannot be verified read-only. Marcel should run `node _SYSTEM/Scripts/token-ledger.mjs verify` and review output. If chain is broken, a re-hash migration is needed (separate task, owner approval required). |
| PARKED-T.C | gpt-5.* zero-cost in spend-report (`isZeroCost=true` but ledger has gpt-5.5 pricing) | `token-spend-report.mjs:94 model.startsWith('gpt-5.')` → isZeroCost=true. Ledger has `gpt-5.5: {input:5, output:20}`. Fix: change `isZeroCost` check to use the pricing map instead of the hardcoded `gpt-5.*` prefix. Deferred as LOW impact — if Marcel has GPT-5 usage, address in Phase 7 along with WP-T.9. |
| PARKED-T.D | `token_policy_versions.pricing_json` DB contents — would confirm CRIT-1 fix viability | DB is in `.claude/state/` / `OS_KERNEL` (protected path boundary). Whether `DEFAULT_POLICY.pricing_json` was written to DB on first-run init cannot be confirmed read-only. The CRIT-1 fix uses `models.json` as the source, which avoids this entirely. |
| PARKED-T.E | `session-state.json` corrupt-state silent-skip in token-session-init.js:43-50 | The `throw new Error('skip')` control-flow means a corrupt session-state.json silently skips re-init (fail-open). Low blast radius in practice. Fix: add a JSON.parse guard before the age check and re-init if parse fails. Deferred as LOW severity. |

---

## 6 · Owner decisions

| ID | Decision | Recommendation | Tradeoffs | Phase gated |
|---|---|---|---|---|
| **D-T1** | Context-% live signal: build a real statusLine→context.pct writer (Option A) vs prose-only acknowledgement (Option B) | **Option A** — leverage the existing statusLine hook registration (settings.json:330) to read `context_window.used_percentage` and write it to `session-state.context.pct` per turn. ~5 lines of code in `token-status.js`. This makes the auto-compact tier mechanism real without a new hook or new state path. Option B is honest but kills the automatic compaction signal entirely. | Option A: statusLine fires every turn — slightly more frequent state writes to session-state. Session-state.json sees more writes. Option B: simplest but compaction is purely prose-driven forever. | Phase 4 (blocking WP-T.4; also gates WP-T.5) |

---

## 7 · Coverage gaps — follow-up AUDIT workpackages

**WP-T.AUDIT-1** — Queue drain throughput verification: `~/.yuri/token-ledger/queue/` file count and age distribution. Not verifiable read-only without timed observation. Marcel should run `ls ~/.yuri/token-ledger/queue/ | wc -l` and `ls -lt ~/.yuri/token-ledger/queue/ | head -5` to see if the queue is growing or stable. If growing, the detached-spawn fix (WP-T.6) + a manual drain of the existing queue is needed.

**WP-T.AUDIT-2** — Hash chain integrity check: `node _SYSTEM/Scripts/token-ledger.mjs verify` — run once when Marcel has a moment. If it reports a break, a separate migration task is needed to repair the chain.

**WP-T.AUDIT-3** — `token_policy_versions.pricing_json` initial write verification: confirm whether `token-ledger.mjs`'s first-run init wrote the `DEFAULT_POLICY` pricing to the DB table. If it did, WP-T.1 can optionally read pricing from the DB instead of models.json (more authoritative, stays in sync with the ledger's own constants). Requires a safe DB read path.

---

## 8 · Final acceptance gate

Ordered; each step gates the next.

1. **Baseline stable:** `node _SYSTEM/Scripts/token-spend-report.mjs 2>&1 | grep -c "0.000000"` returns 0 for Claude model rows after WP-T.1 fix (Claude cost no longer $0).
2. **Claude pricing in config:** `grep "claude-sonnet\|claude-opus" .claude/config/models.json` returns pricing entries.
3. **DeepSeek pro list price:** `grep "pro_list_price" _SYSTEM/Scripts/token-spend-report.mjs` returns the updated key (no `pro_discounted` reference in the cost path).
4. **Session-end honest label:** `grep "lifecycle_marker\|unobservable" .claude/hooks/token-session-end.js` returns the new label.
5. **Context-% live signal (Option A) or honest comment (Option B):** depending on D-T1 choice: `grep "context_window.*used_percentage\|statusLine.*pct" .claude/hooks/token-status.js` (Option A) OR `grep "frozen stale\|prose-advisory" .claude/hooks/pre-tool-use.js` (Option B).
6. **Detached spawn fault fallback:** `grep "spawn-failures\|FAULT_DIR" .claude/hooks/token-tool-logger.js` returns the fallback code.
7. **Opus 4.8 stale reference removed:** `grep "Opus 4.8\|opus-4-8" .claude/skills/tokenmaxxing/SKILL.md | wc -l` returns 0.
8. **Compact threshold aligned:** `grep "60%\|65%\|40k" .claude/skills/compact-optimizer/SKILL.md` shows the phantom hard-max replaced by a guideline note.
9. **D-T1 decision recorded** in session report.

Wave is DONE when all 9 are green AND §5's completeness contract holds. Write the wave report as `wave3-tokens-fix-wave-report-<date>.md` next to this file.
