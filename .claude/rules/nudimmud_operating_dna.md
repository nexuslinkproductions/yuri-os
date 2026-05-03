# NUDIMMUD Operating DNA — Canonical Contract

> Source of truth for all Yuri OS sessions. Future short prompts inherit this by reference.
> Do not duplicate content from referenced rule files; point to them instead.

---

## 1. Authority Hierarchy

1. Owner intent — explicit session instructions (highest)
2. Direct evidence — shell/git/runtime reads, observed filesystem state
3. Executable contracts — hooks, validators, preflight checks
4. `CORE_PROTOCOL.md` + `.claude/rules/*.md` — codified rules (this file is one of them)
5. `CLAUDE.md` + `~/.claude/CLAUDE.md` — session directives
6. Skills — on-demand domain knowledge
7. Task prompt — as parsed by model
8. Model inference — lowest; always loses to local evidence

---

## 2. Exception Mechanism

Any rule may be overridden **only** with explicit owner approval OR an already-defined runtime contract:
```
EXCEPTION: <rule-id> | REASON: <one sentence> | SCOPE: <session|task|file> | VALIDATION: <check to run> | APPROVAL: owner | DISCLOSURE: final-report
```
- `auto` is not a valid APPROVAL value.
- Log the exception before acting. Disclose in the final report's NON_CLAIMS section.
- No silent overrides.

---

## 3. Local Truth Contract

- Code, files, and git history beat model assumptions. Always read before claiming.
- Before citing a symbol, function, or file: verify it exists now (not at training time).
- Stale memory conflicts with current state → trust current state, update memory.
- See: `tool_routing.md` for file-read tier policy.

---

## 4. Sprint Contract

- ONE_TRANSACTION: complete one coherent unit of work before starting the next.
- Audit first, mutate with authority — read blast radius before editing.
- SPLIT_REQUIRED when a task would overflow context, affect >3 files, or touch shared infra.
- Stop at SPLIT boundaries; report and wait for owner re-entry.
- Build loop default: `build → polish → audit → critique`.

---

## 5. Mutation Contract

- Confirm `cwd = /Users/marcelspatz/NUDIMMUD` and `branch = main` before any write.
- Never auto-switch directory or branch on mismatch — report and stop.
- Scope writes to the minimum necessary files. No broad `git add .`.
- T7 (`/Volumes/T7`) is read-only. Local → T7 requires explicit supervised approval.
- See: `local_execution.md` for T7 rules.

---

## 6. Output Contract

- FINAL_REPORT_ONLY_UNLESS_BLOCKED: no intermediate progress dumps unless blocked.
- Report cap: 120 lines (research: 80 lines).
- No trailing summaries, no "what I just did" recaps, no preamble.
- Use structured report format when explicitly required:
  `RESULT | CURRENT | FILES_CHANGED | VALIDATION | COMMIT | NON_CLAIMS | NEXT_RECOMMENDED`

---

## 7. TokenOps Contract

- Caveman mode always active: zero preamble, maximum brevity in speech, depth in code/docs.
- Main thread = overseer + finalizer only. Never researcher or implementer.
- `/compact` before context hits 60%. Use `/compact-optimizer` to build the hint first.
- `/clear` between unrelated tasks.
- Background tasks: `[bg]` prefix or `ctrl+b` → spawn `Agent({ run_in_background: true })`.

---

## 8. Research Contract

Full tier table and approval rules: see `research_pipeline.md`.

Summary: always start at Tier 0 (local cache / git history). Escalate only when lower tier is provably insufficient. Tier 5 (full crawl / WebFetch) requires explicit owner approval.

---

## 9. Swarm / Offload Contract

- Routing priority: `@deepseek → @qwen → @gpt-oss → @swarm → @claude` (last resort).
- Spawn smallest lane that can finish the work.
- Fan-out with explicit file boundaries per agent to prevent silent overwrites.
- Verification wave gates next phase — never merge unverified parallel output.
- M2 Pro capacity: 8–10 safe, 14 hard ceiling. Check `Scripts/offload.sh --list` before spawning.

---

## 10. Model Routing Contract

| Workload | Model |
|----------|-------|
| Architecture, security, orchestration, mutation, final review | Sonnet 4.6 |
| Low-risk exact checks, summarization, extraction, markdown cleanup, bulk transforms | Haiku 4.5 |
| Background workers | Haiku 4.5 max |
| Fast research, reasoning augmentation, cost-sensitive synthesis | DeepSeek Flash |
| Complex reasoning requiring chain-of-thought depth beyond Sonnet | DeepSeek Pro |
| Code generation and transformation tasks (cloud offload) | Codex / GPT-5.5 |
| Multimodal or large-context synthesis | Gemini (when routed via offload) |
| Opus | Explicit owner approval only after Sonnet retries exhausted |

**Haiku boundary:** may handle low-risk exact checks, summarization, extraction, markdown cleanup.
**Haiku hard limits:** must NOT handle high-risk mutation, security gates, ambiguous architecture decisions, final local-truth verdicts, or tool orchestration.

---

## 11. Safety / Security Contract

- No silent privilege escalation.
- No destructive commands (`rm -rf`, `reset --hard`, `push --force`) without explicit request.
- No `--no-verify` or hook bypass unless explicitly requested.
- Impact analysis (`gitnexus_impact`) MUST run before editing any symbol.
- HIGH or CRITICAL risk → warn owner before proceeding.
- Protected areas: Conclave, secrets, T7, unrelated production logic.

---

## 12. DB / Process Contract

- `backend/data/nudimmud.db` is primary. `db-shm` / `db-wal` tolerated but not staged.
- No schema migrations without explicit task scope.
- No process kills (`kill`, `pkill`) without confirming the target PID first.
- Shell service on port 3098 managed by launchd — do not restart without owner approval.

---

## 13. Evidence / Non-Claim Contract

- Mark all claims: `Observed | Inferred | Assumed | Unknown`.
- Do not invent metrics, test results, or accomplishments.
- Do not claim a check was run without evidence it was run.
- NON_CLAIMS section required in any final report where scope was limited.

---

## 14. Anime-DNA Gate Routing

- Domain expansion (`/yuri-domain`): scoped execution + exit criteria enforcement.
- Infinity guard (`/yuri-guard`): action boundary + mutation approval gate (always-on).
- Zenkai loop (`/yuri-zenkai`): failure capture + root-cause + regression + improvement.
- Pattern mirror (`/yuri-pattern-mirror`): artifact observation + reconstruction.
- Clone orchestrator (`/yuri-clone`): budgeted multi-agent decomposition + synthesis.
- DNA install: `/yuri-dna-ingest` for composite extension setup.

---

## 15. Prompt Compression Standard

Short prompts must inherit this contract by reference:
```
INHERIT: nudimmud_operating_dna.md
EXCEPTIONS: <none|list>
SCOPE: <file|task|session>
```
Inherited rules apply in full unless overridden via the exception mechanism (§2).

---

## 16. Runtime Enforcement Roadmap

Status legend: **Known surface** = observed in use; not re-verified in this sprint. **Planned** = not yet built.

| Item | Status |
|------|--------|
| Hook-based mutation guard (07J schema) | Known surface (inherited from 07J audit) |
| GitNexus impact gate | Known surface (inherited from CLAUDE.md directive) |
| Session start preflight (cwd + branch) | Known surface (inherited from hook config) |
| Compact hint automation | Known surface (inherited from compact-optimizer skill) |
| Swarm file-boundary enforcement | Partial |
| Automated evidence tagging | Planned |
| Tier-0 research auto-routing | Planned |
