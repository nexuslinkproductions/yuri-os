# Playbook: Parallel Symbiotic Pulse with Codex + DeepSeek-with-tools

**Set:** 2026-05-14
**Severity:** OPERATIONAL PLAYBOOK — concrete patterns for always-on parallel execution

## The Operating Mode

Symbiotic Pulse = **continuous concurrent operation** of Claude (control), Codex (implementation), DeepSeek-with-tools (parallel implementation + 1M analysis), llama3.2 (local utility). NOT a fallback for rate-limit windows. The default.

## Branch Topology Per Campaign

Decompose every multi-task campaign into **disjoint branches** that can execute simultaneously:

```
Branch A — Codex gpt-5.5     : large/complex implementation
Branch B — DeepSeek-w-tools  : multi-file analysis + autonomous file ops (1M ctx)
Branch C — Codex gpt-5.4-mini: bounded fast implementation
Branch D — Deterministic Bash: tests, git, gitnexus, smoke probes (no model)
Branch E — llama3.2 local    : triage/classification/quick reads (no token cost)
Branch F — Main thread       : synthesis, merge, control
```

All branches run **concurrently when scopes are disjoint**. Main thread coordinates merges.

## Concrete Patterns

### Pattern 1 — Multi-file refactor (4-8 files)

```
Decompose: split file list deterministically
  files[0..N/2] → Branch A (Codex gpt-5.5 with workspace-write)
  files[N/2..N] → Branch B (DeepSeek-with-tools, prompt: read each then write back)
Both branches run via Bash run_in_background: true
Main thread waits on completion notifications
Merge: git diff inspection, conflict resolution
```

### Pattern 2 — Implementation + parallel test scaffolding

```
Branch A: Codex implements feature in src/
Branch B: DeepSeek-with-tools writes test files in tests/ simultaneously
   (DeepSeek prompt: "read src/X to understand interface, write tests/X.test")
Branch D: GitNexus impact check on Branch A's symbol edits
Merge: run tests against Branch A's implementation
```

### Pattern 3 — Codex burst rate-limited

```
This is NOT a degraded mode. It's just a different shape:
Branch A (Codex): paused
Branch B (DeepSeek-with-tools): MAIN implementation lane during the window
Branch C (Codex mini): may still have quota — try smaller scopes
Branch D/E: continuous deterministic + local work
When Codex resumes: it joins back as another branch, doesn't restart anything
```

### Pattern 4 — Conflict avoidance (deterministic file split)

```
Never let two branches touch the same file. Splits:
  - By file: Codex on adapter A, DeepSeek on adapter B
  - By function: Codex on validate(), DeepSeek on parse() in same file
    → coordinate via line ranges in the prompt
  - By layer: Codex on src/, DeepSeek on tests/
  - By language: Codex on .ts, DeepSeek on .py/.md
```

## GitNexus Impact in Both Lanes

Both Codex AND DeepSeek-with-tools can call `bash` tool to run `npx gitnexus impact <symbol>` before mutating. Pattern:

```
Branch prompt header:
  "Before any write_file on src/, call bash: npx gitnexus impact <symbol>
   Report the blast radius. Only proceed if direct dependents < 10."
```

## Merge Synthesis (Main Thread Job)

When all branches complete:

1. Main thread reads all branch outputs (artifact dirs, stdout, stderr)
2. `git diff --stat` to see total scope of changes
3. Resolve any unexpected file overlaps (rare with deterministic splits)
4. Run consolidated regression test suite (`offload-contract-regression`, etc.)
5. Single commit per coherent unit of work, OR scoped commits per branch

## Anti-Patterns

- ❌ Sequential dispatch when scopes are disjoint (waste of wall-clock)
- ❌ Letting one branch wait idle for another's output (use synthesis-at-end pattern)
- ❌ Both Codex and DeepSeek touching the same file (use deterministic split)
- ❌ Treating DeepSeek as fallback only (it's a permanent parallel implementer now)
- ❌ Burning a Codex burst on a task DeepSeek-with-tools could do for free

## Anime DNA Gates Per Branch

Each branch passes through gates independently:

1. **Pattern-Mirror (Sharingan):** read existing similar code first
2. **Execution-Domain:** scope-lock with exit criteria
3. **Clone-Orchestrator:** the branch IS the clone
4. **Infinity-Guard:** dry-run before live writes
5. **Failure-Evolution:** capture + regression any failure

Main thread synthesizes across branches and applies gates at merge layer too.

## Evidence

- `f3c089b3` (palace EXCLUDE_DIRS fix) — first end-to-end DeepSeek-with-tools autonomous edit
- This very campaign — Tracks 1A, 1C, 2C, 1B all dispatched as parallel branches
- User instruction 2026-05-14: "the symbiotic pulse is the way that yuri always operates at each
  of my as well as yours/codex/deepseek input. that is the living consistent power function
  that runs all the time. use the anime dna gates to help with the process"
