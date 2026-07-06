# 02 — ADOPTION BLUEPRINTS (Phase 2 build spec)

> Clean-room YURI-native build contracts for the 6 greenlit items. Phase 2 of the mission (`00-MASTER-BRIEF.md`).
> Source: 13-agent design+red-team workflow (runId `wf_99cbe42d-a34`, 1.6M tokens). Full prose blueprints in the workflow output; this is the actionable per-item build contract. Sim + red-team detail in `03-SIM-REDTEAM.md`.
> **DESIGN-ONLY artifact. Build is owner-gated per item (see readiness flags).**

## Build order (dependency + readiness + blast-radius driven — NOT order-effect; sim proved commuting)

| Rank | Item | Readiness | Effort | Gate | Owner-blocked? |
|------|------|-----------|--------|------|----------------|
| 1 | **firmware-policy** | needs 4 doc corrections | S | **safe-to-build** (docs only) | dual-copy Q (non-blocking) |
| 2 | staleness-extension | needs-design-change | M | owner-gate (xref closed schema) | committed-vs-working-tree scope |
| 3 | **skill-security-gate** | **ready-to-build** (7 hardening items) | L | owner-gate (corpus-security-scan + capabilities.json) | advisory-vs-autoblock on ingest |
| 4 | ccr-compression | needs 4 small changes | M | owner-gate (compact-optimizer SKILL.md hash) | TTL default |
| 5 | cost-admission-gate | needs-design-change | M | owner-gate (llm-lane.mjs dispatch seam) | **BLOCKED: budget cap value + window + free-lane exemption + over-estimate multiplier** |
| 6 | human-review-sublane | needs-design-change | L | owner-gate (claude-protocol-guard live plan gate) | **BLOCKED: F-verdict hard-block vs advisory; real human at PTY vs HITL theater** |

> Note: rank 2 (staleness) and rank 3 (skill-security) order is flexible — skill-security is the only *ready-to-build* item and the highest commercial urgency, so it can lead once owner-gated. Synthesis recommends firmware-policy first (de-risks all), then skill-security.

---

## ITEM 1 — firmware-policy (Tier-0, zero-code) · SAFE-TO-BUILD
**Objective:** turn skill/prose/design discipline from vibes into countable, failure-anchored rules.
**CAPABILITY-FIRST CATCH (red-team):** `skills/writing-skills/SKILL.md` (lines ~459–509) ALREADY owns a `| Excuse | Reality |` rationalization table + "Red Flags List" + a RED-GREEN-REFACTOR baseline loop = the prompt-as-firmware spirit. → **POINT to it, don't duplicate.** skill-creation.md adds only the YURI delta: a failure-anchor per rule/row.
**filePlan:** modify `.claude/rules/skill-creation.md` (add Step 6 failure-anchor convention + Step 7 anti-rationalization pointing to writing-skills) · modify `.claude/memory/feedback-ai-slop-catalog.md` (+3 DONT axes: false-agency, negative-listing, 5-dim revise-gate) · modify `skills/frontend-design/references/design-principles.md` (+ countable AI-Tell Catalog section, tagged general-prose vs landing-page so it doesn't contaminate HUD/Kagami).
**4 corrections before build:** (1) drop the false dual-load rationale — `.claude/skills/frontend-design/SKILL.md` does NOT reference design-principles.md (grep=0); the `.claude/skills/` copy is an **orphan**. Edit the canonical `skills/` copy; treat `.claude/skills/` copy as dormant (owner Q: collapse+symlink vs keep). (2) anti-rationalization = pointer-to-writing-skills + failure-anchor delta only. (3) `@anchor` marker is advisory (no validator yet — Tier-3 grep-validator later). (4) opt-in with honest `@anchor: none` allowed.
**Convention:** inline HTML comment `<!-- @anchor: vN | failure: <dated ledger handle e.g. FB:MIMO-PEER-LANE 2026-06-13> | regression: <feedback-*.md handle | test path | zenkai spec id> -->` — binds to YURI's real 81 `feedback-*.md` + zenkai ledger, greppable (`grep -rn '@anchor:' .claude/skills/`).
**No gate collision (verified):** skill-hash gate hashes only SKILL.md bodies (none touched); no capabilities.json regen; @anchor is inert HTML comment.

## ITEM 2 — staleness-extension · owner-gate
**Objective:** extend `xref-drift-scan.mjs` from HEAD-level drift to per-file content-hash reconciliation at query time + per-file staleness banner in `xref-query` results; provenance-tag heuristic graph edges so the energy gate discounts guessed hops.
**filePlan:** modify xref-drift-scan.mjs · xref-query.mjs · **xref-provenance.mjs (CLOSED schema shared with propagation-scan)** · their tests · capabilities.json (regen).
**Hardening:** default `fileStaleSet` to **committed-drift only** (`git diff --name-only indexedCommit..head`) — the live working tree has **220 dirty files incl. xref-drift-scan itself**, which self-defeats the decisive test; working-tree union → opt-in flag, default OFF. Compute perFileStale inside `gradeCandidate` via `normalizePath`. Build the missing git-scratch test helper.
**Owner decision:** committed-vs-working-tree staleness scope; does `heuristicEdge` ship now or get dropped (red-team: it duplicates the existing `queryInvariant` flag and has zero live consumer → reframe as forward-wiring or drop).

## ITEM 3 — skill-security-gate · READY-TO-BUILD · owner-gate · highest commercial urgency
**Objective:** upgrade `corpus-security-scan.mjs` 7-cat regex → 16-cat taxonomy + JS-native AST (JS/TS+Bash; **no Semgrep/tree-sitter binary** per R2) + taint source→sink + OSV.dev CVE (offline snapshot fallback) + SARIF 2.1.0 + acquisition-time foreign-skill install gate (SAFE/CAUTION/DO_NOT_INSTALL + exit codes).
**filePlan:** modify corpus-security-scan.mjs · create `_SYSTEM/Scripts/corpus-threat-taxonomy.mjs` · create `security/ast-js.mjs`, `security/ast-bash.mjs`, `security/taint-model.mjs`, `security/osv-lookup.mjs`, `security/sarif-emit.mjs` · create `_SYSTEM/data/osv-snapshot.json` · modify test + capabilities.json.
**7 hardening items locked into build contract:** (1) all `security/*.mjs` PURE node-builtin, ZERO REPO_ROOT computation — inject the snapshot path from the orchestrator (so `root-architecture.test.mjs` doesn't flag them). (2) `@capability` tag ONLY on top-level scanner + atomic capabilities.json regen same commit. (3) default/--json emits a SINGLE JSON object to stdout, warnings to stderr (additive-superset, legacy keys preserved). (4) `--osv-online` AbortController timeout + fail-soft to snapshot. (5) tokenizer parse-failure degrades to regex, never throws. (6) secret-safe test fixtures (no `sk-`/`AKIA`/`ghp_`/`nvapi-` prefixes). (7) `DYNAMIC_CODE_EXEC` additive, not split from SUPPLY_CHAIN (avoids corpus-absorb score drift).
**Owner decision:** advisory vs auto-block on ingest (keep advisory this phase). Effort realistically L→XL (hand-rolled tokenizer).

## ITEM 4 — ccr-compression · owner-gate
**Objective:** reversible compaction (compress + cache original w/ TTL + retrieval sentinel) upgrading compact-optimizer from one-way; CacheAligner-style detector flagging volatile tokens in the KV-cache-hot prefix (warn, never mutate prefix); content-typed routing (JSON/code/prose).
**filePlan:** create `ccr-compress.mjs` + test · create `cache-prefix-scan.mjs` + test · modify compact-optimizer/SKILL.md · capabilities.json · context-registry.json.
**4 small changes:** (1) add `yuri-skill-loader.mjs --write-manifest` step after editing compact-optimizer SKILL.md (registered hash `b7904322`, validate exit(1)s on drift). (2) capabilities count 30→32 (regen, never hand-edit). (3) fix Lane Result Grammar label to canonical `04CP_CACHE_PREFIX_SCAN_X_COMMITTED`. (4) `--self` reads ONLY global.md + MEMORY.md, never full brain-inject (which reads deny-listed `.claude/state/cortex-state.json`).
**R1 decision:** provider-agnostic (just compression) vs provider-aware cache detection. Owner: TTL default (continuity vs disk). `--self` DIAGNOSES the cache-prefix leak, does not repair it.

## ITEM 5 — cost-admission-gate · owner-gate · OWNER-BLOCKED
**Objective:** two-stage admission (capacity reservation vs per-tick selection); estimate cost-to-completion, reserve against budget, reject/queue if it can't fit (no-partial-admit); release-and-reacquire + rollback (R3).
**filePlan:** create `cost-reservation-pool.mjs` + test · **modify llm-lane.mjs (THE single dispatch seam)** · modify token-ledger.mjs (MUST add additive exports — the "reuse exported math" claim is FALSE; math is file-private today) · yuri-slm-worker.mjs · models.json · package.json.
**Hardening:** export (don't duplicate) token-ledger math (currency-parity); actualsToDate must FAIL CONSERVATIVE on getRollups 100-row truncation / missing better-sqlite3 (never actuals=0); R3 reacquire is forward-safe primitive w/ no live caller (reframe, don't sell as live); keep DISARMED dual-arm.
**BLOCKED on owner:** real budget cap value + window semantics + free-lane USD exemption + over-estimate multiplier — gate governs nothing until armed (`YURI_COST_ADMISSION_ENFORCE=1` + flag file).

## ITEM 6 — human-review-sublane · owner-gate · OWNER-BLOCKED · highest wiring risk
**Objective:** optional HITL plan/diff annotation surface; structured feedback→agent; Plan-Diff across resubmissions; **mutually exclusive** with the autonomous `plan_dispatch_gate` (toggle, never both on same ExitPlanMode event).
**filePlan:** create `plan-review.mjs` + test · **modify post-tool-use.js + claude-protocol-guard.mjs (the live plan_dispatch_gate arm/fire sites)** · modify `ai`, yuri_operating_dna.md · create plan-review SKILL.md + command.
**Hardening:** RESULT_LABEL `..._X_PASS` FAILS `parseResultLabel` → use `_X_PASS_COMMITTED`/`_F_BLOCKED`; store BARE label (prefixed mis-parses); toggle on|off must FAIL LOUD on null/corrupt state (live state has no `plan_review_mode`); mode-gate at THREE sites incl. opportunistic self-satisfy block; LCS scale cap + atomic revision; session-state writes ONLY via session-state.js wrapper (deny-listed path).
**BLOCKED on owner (highest stakes):** does the changes-requested (F) verdict HARD-BLOCK the next mutation (real R4 enterprise guarantee, fights continuous-PTY autonomy) or stay advisory (`emitWarnings`)? Is there a real human at the PTY or is HITL theater? The mutual-exclusion-with-autonomous-gate invariant is a load-bearing safety property.
