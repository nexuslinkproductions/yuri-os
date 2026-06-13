# Wave-3 Codex Second-Opinion Spec (Saved Copy)

> **Source:** originally written to `/tmp/wave3-codex-spec.md`. This file is the durable copy — `/tmp` clears between sessions.
> **Status:** Codex lane credits blocked until Jun 11 ~20:36. Re-dispatch this spec via `ai @codex` after credit reset.
> **Purpose:** Codex second-opinion on the five wave-3 governance/skills/tokens/hidden-meta/learning domains. Focus: attack the attack-confirmed findings for any missed root cause, missed fix direction, or implementation hazard the Claude lane didn't surface.

---

## Dispatch instructions

```bash
# After Jun 11 credits reset:
ai @codex --task-file _SYSTEM/reports/wave3-codex-spec-saved.md
```

Or if the `ai @codex` surface requires a prompt string:
```bash
ai @codex "$(cat _SYSTEM/reports/wave3-codex-spec-saved.md)"
```

Expected output: a Codex findings file at `_SYSTEM/lane-output/codex/wave3-*/findings.md` covering the priority review items below.

---

## YURI Identity / Persona preamble (required for all Codex dispatches)

You are Rick — YURI's adversarial ally, cognitive extension, irreverent co-pilot. Your job is not to confirm; it is to attack and find what was missed. Refute-by-default on every finding. Apply the YURI adversarial-verification discipline: name failure modes, run the smallest meaningful checks, state residual risk. Output format: structured Codex findings.md with CONFIRMED / REFUTED / EXTENDED for each item reviewed.

---

## Context loadout (read in this order)

1. `CLAUDE.md` (repo root)
2. `_SYSTEM/reports/wave3-governance-audit.md` — FINDINGS + ATTACK PASS
3. `_SYSTEM/reports/wave3-enforcement-chain-deep.md` — FINDINGS + ATTACK PASS
4. `_SYSTEM/reports/wave3-skills-audit.md` — FINDINGS + ATTACK PASS (count corrections override)
5. `_SYSTEM/reports/wave3-tokens-audit.md` — FINDINGS + ATTACK PASS
6. `_SYSTEM/reports/wave3-hidden-meta-audit.md` — FINDINGS
7. `_SYSTEM/reports/wave3-session-boot-deep.md` — FINDINGS
8. `_SYSTEM/reports/wave3-learning-audit.md` — FINDINGS + ATTACK PASS
9. `_SYSTEM/reports/wave3-learning-loop-deep.md` — closure table + FINDINGS
10. The five handover packages (for fix direction context):
    - `_SYSTEM/reports/wave3-governance-handover.md`
    - `_SYSTEM/reports/wave3-skills-handover.md`
    - `_SYSTEM/reports/wave3-tokens-handover.md`
    - `_SYSTEM/reports/wave3-hidden-meta-handover.md`
    - `_SYSTEM/reports/wave3-learning-handover.md`

---

## Priority review items (attack these specifically)

### P0 — Governance: settings.json trust-root gap (WP-G.1)

The audit found `.claude/settings.json` is NOT in `ROLE_TRUST_SURFACES.files`. The recommended fix adds it. Attack: (1) Are there OTHER critical files not in ROLE_TRUST_SURFACES that a coworker could edit to disable guards? Run `ls .claude/hooks/ | wc -l` and compare to `ROLE_TRUST_SURFACES.files` count (11). What else is exposed? (2) Does adding settings.json to ROLE_TRUST_SURFACES create any circular dependency (the trust kernel IS a file in the trust surface)? (3) Is there a bash path that bypasses operator-write-guard for settings.json even after the fix?

### P0 — Governance: phantom codex_gate sector (WP-G.8)

The audit found 7 codex_gate die nodes with zero executable implementation. The fix proposes either building the two-phase gate or deleting the die nodes. Attack: (1) Is there ANY partial codex_gate logic anywhere in the codebase? Run `grep -rn "propose\|\.approved\|headSha\|stale" _SYSTEM/Scripts/ .claude/hooks/` with a broader search. (2) If building Option A: what is the minimal viable two-phase gate implementation? Is 100 lines realistic? What are the failure modes of the HEAD SHA stale-protection specifically? (3) What is the blast radius of the 7 die nodes being gone from the schematic vs having them be phantom?

### P0 — Tokens: loadPricing() Claude cost $0 (WP-T.1)

The audit found Claude cost reports as $0. The fix adds an `anthropic` section to `models.json` and updates `loadPricing()`. Attack: (1) Is the `token_policy_versions.pricing_json` table in `memory.db` actually populated from `token-ledger.mjs` DEFAULT_POLICY on first-run init? If it is, the fix should read from the DB (authoritative) not models.json (duplicated config). (2) Does `loadPricing()` have any other callers besides `token-spend-report.mjs`? Run `grep -rn "loadPricing" _SYSTEM/Scripts/`. (3) Is there a race condition between the `token-ledger.mjs` first-run init and the spend-report read?

### P1 — Hidden-meta: eot-background-start.js (WP-H.1)

The audit recommends deleting from SessionStart. Attack: (1) Does `user-prompt-submit.js:101-115,239-251` (the real EOT path) have any dependency on the `/tmp/claude-eot-*.marker` file that eot-background-start writes? Run `grep -rn "claude-eot\|eot.*marker" .claude/hooks/ _SYSTEM/Scripts/`. (2) Is the "🔄 EOT monitoring active" string checked anywhere in the session or skill system? Run `grep -rn "EOT monitoring\|monitoring active" .claude/ _SYSTEM/`. (3) What is the actual line in `user-prompt-submit.js` that handles EOT — confirm the trigger chain is self-contained.

### P1 — Learning: dream-processor trigger (WP-L.1)

The audit found 882 pending / 0 processed. The fix arms a trigger. Attack: (1) Read `yuri-dream-processor.mjs` in full. Does it have any safeguards against processing all 882 items in one run (token/cost explosion)? What is the per-item DeepSeek cost and the total exposure if all 882 are processed at once? (2) Does `yuri-dream.js` (the producer) have any rate-limiting on how many items it adds per session? Could a session add 10+ items and the trigger drain them all on the next run? (3) Is the `### Auto-synthesized` block format in `global.md` safe for brain-inject.js to load — no format collision with existing sections?

### P1 — Learning: lane-calibration path mismatch (WP-L.2)

The audit found the reader uses `~/.yuri/lane-calibration.json` while the writer outputs to `.claude/state/lane-calibration.json`. Attack: (1) Is the `.claude/state/lane-calibration.json` file readable by `llm-compat-contract.mjs` at runtime? (settings deny-list blocks Write/Edit on `.claude/state/**` but not Read — confirm via `grep "state.*read\|Read.*state" .claude/settings.json`). (2) Is the `com.yuri.lane-calibration` LaunchAgent actually loaded? Run `launchctl list | grep yuri` and `ls ~/Library/LaunchAgents/ | grep calibration`. (3) After fixing the path, what does `readCalibration()` return on an empty feedback log? Is the `applyCalibrationToLane` function safe with neutral calibration data?

### P2 — Skills: body cap guard (WP-S.10)

The audit found `SKILL_BODY_MAX_TOTAL=15000` with no priority protection for canonical skills. Attack: (1) At the current 219 total skills and 111 cache skills, is the 15k cap ever actually hit? Compute: 219 × average body size. Is the proposed fix preventing a currently-occurring bug or a future one? (2) Does the `enforceTotalBodyCap` sort-by-type change interact correctly with the `bodyPruned` flag on cache skills? (3) Are there any consumers that depend on cache skills having non-empty bodies?

---

## Output format

Write findings to `_SYSTEM/lane-output/codex/wave3-review/findings.md`. Use the LANE_RESULT format:

```
CODEX_REVIEW: wave3 second-opinion
DATE: <today>
ITEMS_REVIEWED: <N>

### <item-id> — <CONFIRMED|REFUTED|EXTENDED>
<Evidence>
<Missed root cause or fix hazard if any>
<Recommendation delta vs handover>
```

Output cap: 160 lines for the full findings file.

---

## Hard constraints

- Read-only everywhere except the output file.
- Do NOT execute bypass forms.
- Do NOT touch protected paths.
- Evidence must be local-file-backed; mark any model-inference-only claim as `[ADVISORY]`.
