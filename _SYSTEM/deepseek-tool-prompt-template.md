# DeepSeek-with-Tools Prompt Template (PATCH 011)

**Validated:** 2026-05-14 — bounded prompts avoided `TOOL_CALL_REPETITION_LIMIT` that the unbounded MANGEKYO prompt hit.

## The Rule

Every dispatch to `deepseek-v4-pro --tools` (or `deepseek-v4-flash --tools`) MUST include three concrete bounds. Without them, DeepSeek's 50-iteration tool loop can stall in re-read cycles on open-ended prompts (most common: "ruthlessly audit X" with no completion criterion).

## Required Prompt Fields

### 1. MAX file reads
Cap the number of `read_file` calls explicitly. For most analysis/spec tasks: **8 reads**. For comprehensive audits: **15 reads**. For single-file fixes: **3 reads**.

```
STRICT BOUNDS: max 8 read_file calls + 3 bash calls.
```

### 2. MAX bash calls
Cap the number of `bash` calls. Most tasks need **3-5 bash calls** (one for orientation, one for verification, one for cleanup). Audit tasks may need more — 10 is the practical ceiling.

### 3. Concrete completion criterion
What deterministic state proves the task is done? Examples:
- `write_file specs/active/<slug>.md`
- `bash 'grep -c "X" path/to/file' returns N`
- `read_file path/to/file' confirms LINE matches PATTERN`

Bad: "audit X comprehensively" (no completion state)
Good: "write_file path/to/result.md with sections A, B, C filled"

## Optional Bounds

### MAX iterations (if non-default)
DeepSeek's runner default is 50 iterations. Override via prompt:
```
ITERATION CAP: 20 iterations max.
```

### REQUIRED FILE LIST
For tasks with a known file scope, list exact paths:
```
REQUIRED FILES TO READ (use these exactly, don't search broadly):
1. _SYSTEM/Scripts/foo.mjs
2. _SYSTEM/Scripts/bar.mjs
```

This eliminates the "what should I read next?" re-iteration that triggers repetition.

## Template Skeleton

```
Use your tools (read_file, write_file, bash) to <verb> <object> autonomously.

STRICT BOUNDS: max <N> read_file calls + <M> bash calls.
ITERATION CAP: <K> iterations max. (optional)

REQUIRED FILES TO READ (use these exactly, don't search broadly):
1. <path>
2. <path>
...

REQUIRED BASH:
1. <command>
2. <command>
...

THEN execute these actions:

ACTION 1 — <concrete action with concrete completion>
ACTION 2 — <concrete action with concrete completion>

CONSTRAINTS:
- Touch only <files>
- No auto-commit
- <other constraints>

CONCRETE COMPLETION CRITERION: <deterministic state that proves done — e.g., "write_file <path> exists with N lines">

Report when done: <expected output format>
```

## Validation

| Bounded prompt this session | Outcome |
|---|---|
| `/spec-intake` Phase 2 (max 8 reads + 3 bash + concrete completion) | DeepSeek wrote spec, no repetition limit |
| Lane-health regex fix (read 1 file + 1 verify) | DeepSeek autonomous fix, completed cleanly |
| Palace EXCLUDE_DIRS edit (read 1 file + 1 bash run) | DeepSeek autonomous edit, completed cleanly |

| Unbounded prompt this session | Outcome |
|---|---|
| MANGEKYO audit "ruthlessly examine weaknesses" with no read cap | Hit `TOOL_CALL_REPETITION_LIMIT`, main thread had to take over |

## Anti-Patterns

- ❌ "Audit the codebase comprehensively" (no read cap, no completion criterion)
- ❌ "Find all issues with X" (open-ended, encourages re-reading)
- ❌ Listing >15 files in REQUIRED FILES (too many = back to broad search)
- ❌ Multiple completion criteria with `OR` (model picks one and stalls debating which)
- ❌ Asking for "ranked" or "comprehensive" output without word/line cap

## Reference

- `memory/feedback_deepseek_tool_unblock.md` — DeepSeek tool unblock policy
- `memory/feedback_long_session_codex_burst.md` — DeepSeek 1M burst pattern (uses this template)
- MANGEKYO PATCH 011 in `.claude/eot/2026-05-14_1300/MANGEKYO_EVIDENCE_AUDIT.md` — A4 weakness this template addresses
