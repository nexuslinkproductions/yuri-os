# Pulse Classifier Tuning Baseline

Generated: 2026-05-14 | Session: post PATCH 040–044 | Soak sample: 12 turns

---

## Current Heuristics

### Trivial-skip filter (`/.claude/hooks/user-prompt-submit.js`)

```js
function isTrivial(text) {
  if (!text) return true;
  if (text.length >= 60) return false;   // ← LENGTH THRESHOLD
  if (MUTATE_VERBS.test(text)) return false;
  if (FILE_PATH.test(text)) return false;
  if (LANE_MENTION.test(text)) return false;
  return true;
}

const MUTATE_VERBS = /(implement|fix|patch|refactor|debug|rename|delete|migrate|
                       audit|review|deploy|create|add|remove|build|wire|extend|promote)/i;
const FILE_PATH    = /[/][\w-]+\.[a-z]+/i;
const LANE_MENTION = /@\w+/;
```

### Complexity classifier (`_SYSTEM/Scripts/llm-compat-contract.mjs → classifyComplexity`)

| Tier | Conditions (heuristic) |
|------|------------------------|
| trivial | short prompt, no mutate verb, no file path, no lane mention |
| standard | has mutate verb or file path; bounded scope |
| complex | multi-file scope, protocol keywords, 2+ top-level areas |
| critical | `critical/catastrophic/highest risk` keywords, or swarm/promote/protected-path |

Ensemble by tier (live `buildEnsemble`, post lane-consolidation 8ca6c254):
- analysis: `[deepseek-preflight, mimo-preflight]` (+ codex-advisory on code signals, + shura-review on explicit council asks)
- standard: `[deepseek-preflight, mimo-preflight]` (+ codex-advisory on code signals)
- complex/critical: same + `yuri-risk` + `shura-review` (+ openclaw-preflight when its advisory fires)

> Soak baseline: 12 turns as of 2026-06-10 — the 20-turn milestone has not been
> reached; NO calibration pass has run. (The retired advisor names
> openclaw-preflight/hermes-forecast/cassandra and the old offload-contract
> classifier reference were corrected in wave-2; no calibration data exists yet.)

---

## Soak Baseline — 2026-05-14 (12 turns)

```
Trivial-skip count       : 6
Pulse-spawn count        : 6
Total turns observed     : 12
Skip rate                : 50.0%
Unique skip hashes       : 1
  hash c22b5f91          : 6× — confirmed = "go" (len=2), correct trivial classification
Spawn turns              : 6 (all manual critical/complex test runs)
FP candidates (len>10)   : 0
```

**Assessment:** Healthy. Skip rate at 50% is within target range. Zero false positives. Sample too small for tuning.

---

## Tune-When Thresholds

| Milestone | Action |
|-----------|--------|
| **20 turns** | Run `_SYSTEM/Scripts/ai soak`. Check FP candidates. If >0, investigate hashes. |
| **50 turns** | First calibration pass. Compare skip rate to 40–60% target. Tune length threshold if outside range. |
| **100 turns** | Review MUTATE_VERBS — add any verbs that appear in spawn turns but were nearly skipped. Check tier mis-classifications via Cassandra/DeepSeek disagreement rate. |
| **200 turns** | Classifier feedback loop (Backlog #6) — update `classifyComplexity` heuristics from archived WARN+ findings. |

---

## Parameters to Tune (with evidence conditions)

### 1. Length threshold (`text.length >= 60`)

- **Raise to 80** if: FP rate >5% (skipped prompts that were followed by multi-file edits)
- **Lower to 45** if: spawn rate >80% (nearly everything spawns, trivial filter adds no value)
- **Current**: 60 — hold until 50-turn milestone

### 2. MUTATE_VERBS additions

Candidates to add at 50-turn milestone (if observed in false-negative spawns):
- `update`, `modify`, `change`, `test`, `run`, `check`, `verify`, `enable`, `disable`
- Only add if confirmed false-negative — don't bloat the regex preemptively.

### 3. Complexity tier thresholds in `classifyComplexity`

- **Promote standard → complex** if: >3 file paths mentioned OR >2 top-level directories
- **Promote complex → critical** if: contains `security`, `auth`, `protected`, `canonical memory`
- Current thresholds are heuristic; calibrate against archived disagreement findings

### 4. Advisor disagreement detector (`severitySpread >= 2`)

- Currently fires when advisors differ by ≥2 severity levels (e.g., INFO vs HIGH)
- At 50 turns: check if disagreements correlate with actual impl problems. If not, raise to 3.

---

## Audit Commands

```bash
# Quick soak check
_SYSTEM/Scripts/ai soak

# JSON output for programmatic analysis
node _SYSTEM/Scripts/pulse-trivial-audit.mjs --json

# Full cortex state
_SYSTEM/Scripts/ai cortex

# Archive snapshot
_SYSTEM/Scripts/ai cortex --json > .claude/state/pulse-soak-$(date +%Y%m%d-%H%M).json
```

---

## Calibration Loop (Backlog #6 — gates on 200+ turns)

When pulse-archive has enough WARN+ findings (≥20), run:
```bash
ls _SYSTEM/SELF-IMPROVEMENT/pulse-archive/
```
Then cross-reference: do archived findings match actual problems that surfaced? If Cassandra fired CRITICAL but the impl caused no issues, lower its confidence weight. If DEEPSEEK WARN findings were consistently right, raise confidence floor.

Update `classifyComplexity` keyword list and ensemble selection accordingly.
