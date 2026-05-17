# Yuri OS / Yuri — Cross-Session Project Source Context

Date: 2026-04-27  
Prepared for: Marcel UwU project source  
Source type: Cross-checked consolidation of uploaded GPT-5.5 session reports  
Status: Source-ready continuity file, not an independently executed repo audit

---

## 1. Purpose

This Markdown file consolidates the uploaded Yuri OS / Yuri session reports into one usable project-source context file.

It is meant to help GPT-5.5, Claude Code CLI, Codex CLI, Gemini CLI, or a future human reviewer understand:

- what has already happened,
- which facts are currently trusted,
- which older findings were superseded,
- which safety/readiness claims must not be made,
- what should happen next,
- how the different CLIs and models should be routed.

This document separates current trusted state from historical state and unresolved assumptions. It should not be treated as proof that the local repository currently matches every claim. The actual repository still needs post-baseline validation.

---

## 2. Source Reports Cross-Checked

The following uploaded session extracts were reconciled:

1. `YURI_OS_YURI_SESSION_CONTEXT_EXTRACT_2026-04-27.md`
   - Covers ecosystem audit, Sprint 01, Sprint 01.5 recommendation, CLI strategy, and readiness warnings.

2. `yuri_os_yuri_session_context_extract_2026-04-27 (1).md`
   - Covers Claude Code permission hardening, Boring Work Queue, Sprint 02 manifest/skill/agent baseline audit, and Sprint 03A recommendation.

3. `yuri_os_yuri_session_context_extract.md`
   - Covers Sprint 03A through Sprint 04C-H, including trigger metadata, invocation metadata, lifecycle status repair, and command-surface planning preparation.

4. `yuri_os_yuri_session_context_extract (1).md`
   - Covers Sprint 05 and Sprint 06, including command-surface reconciliation, whole-repo skill census, command file creation/validation, git hygiene, hook evidence review, and Sprint 06E baseline commits.

---

## 3. Consolidation Rule

When reports disagree, use the latest accepted sprint state unless the newer report explicitly says it is uncertain.

Current ordering by progression:

1. Ecosystem audit and Sprint 01
2. Permission hardening and Sprint 02
3. Sprint 03A through Sprint 04C-H
4. Sprint 05 through Sprint 06E

The Sprint 05/06 report supersedes earlier command-surface counts. Earlier reports remain useful for explaining how the system got there.

---

## 4. Current Executive Summary

Yuri OS / Yuri is currently in a protected post-baseline reinforcement state.

The system has moved from broad architecture/audit work into controlled repository reinforcement. The latest accepted state is Sprint 06E: a five-commit baseline on branch `main`, covering registries, command surface, reviewed skill documentation updates, core skill directories, Claude policy, and hooks.

The project is still not enterprise-ready or production-ready. It has a committed baseline and scaffolded governance, but several major enforcement areas remain incomplete, unverified, or unknown: sandboxing, policy enforcement, prompt-injection defense, rollback testing, broader automated test coverage, lifecycle review, and hook hardening.

Recommended next task: **Sprint 06E-V — Post-Baseline Commit Validation**.

---

## 5. Current Trusted State

### 5.1 Repository and Baseline

- Trusted state: Sprint 06E baseline was reported committed on branch `main`.
  - Evidence basis: Latest uploaded Sprint 05/06 session report.
  - Confidence: High from visible reports, not independently re-run here.

- Trusted state: Sprint 06E committed five baseline commits:
  - `19ec4ac9 feat(reinforcement): baseline skill and agent registries`
  - `a8c88c38 feat(commands): baseline Yuri OS command surface`
  - `753df8fd docs(skills): baseline reviewed skill documentation updates`
  - `b940f900 feat(skills): add Yuri OS core skill directories`
  - `5b4ad58c refactor(infrastructure): baseline Claude policy and hooks`
  - Confidence: High from visible reports.

- Trusted state: Current branch should be treated as `main`, not `master`.
  - Confidence: High from Sprint 06D-R / 06E reports.

### 5.2 Registry Baseline

- Registry file:
  - `/Users/marcelspatz/YURI-OS-MUSUBI/.claude/reinforcement/skill-manifest.json`

- Manifest version:
  - Reported as `1.0.2`

- Registered skill count:
  - Total: `29`
  - Top-level: `23`
  - GitNexus nested: `6`

- Metadata coverage:
  - `metadata_coverage_count: 29`

- Lifecycle status:
  - `active: 5`
  - `unknown: 24`
  - `reference: 0`

- Active lifecycle/governance skills:
  - `execution-domain-core`
  - `failure-evolution-loop`
  - `parallel-clone-orchestrator`
  - `pattern-mirror-core`
  - `non-destructive-infinity-guard`

- Important semantic rule:
  - `status` means lifecycle/governance readiness.
  - It does not mean invocation model, recent activity, or metadata completeness.

### 5.3 Agent Baseline

- Agent manifest:
  - `/Users/marcelspatz/YURI-OS-MUSUBI/.claude/reinforcement/agent-manifest.json`

- Agent count:
  - `11` agents were reported in Sprint 01/Sprint 02 and baseline work.

- Earlier finding:
  - Sprint 02 reported 5 agents without explicit model assignment:
    - `argus`
    - `cassandra`
    - `hermes`
    - `noesis-linter`
    - `obliteratus-qa`

- Current status:
  - Agent manifest was included in Sprint 06E baseline commit.
  - Exact current model-assignment status should be rechecked in Sprint 06E-V or a later agent audit.

### 5.4 Command Surface

Current accepted command-surface status distribution:

- `existing: 12`
- `deferred: 5`
- `none: 12`

Accepted existing-status command coverage:

- `12/12`

Accepted command surface file count:

- `15`

Command files created and validated in Sprint 05B:

- `.claude/commands/bg.md`
- `.claude/commands/compact-optimizer.md`
- `.claude/commands/graphify.md`
- `.claude/commands/tokenmaxxing.md`

Important accepted classifications:

- `local-subagent.command_surface_status` was corrected from `deferred` to `existing`.
- `eot.md` is an alias for `end-of-transmission`, not a separate registry skill.
- `reflect.md` is a hook utility outside the skill registry.
- `yuri-dna-ingest.md` is an alternate entry point for `non-destructive-infinity-guard`, not a separate skill.
- `compact-optimizer.md` is accepted as the command file for `/compact`, with `/compact-optimizer` as alias.
- Command files are thin wrappers; `SKILL.md` remains behavior authority.

### 5.5 Git Hygiene and Known Noise

- Known tracked deletions:
  - `1,162` tracked deletions were reported and triaged.
  - Most were ephemeral/session/snapshot/lock artifacts.
  - No protected baseline files were reported affected.

- Current interpretation:
  - These deletions are non-blocking but unresolved owner/cleanup-policy work.
  - They should not be silently staged or committed without an explicit cleanup sprint.

Known remaining non-blocking work includes:

- `.gitignore` / ephemeral artifact policy
- tokenmaxxing hook regex safety / silent-failure guard
- EOT MANGEKYO Phase 5.5 scale validation
- EOT LLM-Wiki overlay stability validation
- oracle-* candidate review
- Gemini CLI parity setup

---

## 6. Cross-Checked Superseded Findings

### 6.1 Command Surface Counts

Older count:

- `existing: 11`
- `deferred: 6`
- `none: 12`

Current accepted count:

- `existing: 12`
- `deferred: 5`
- `none: 12`

Reason for supersession:

- `local-subagent` was found to have a valid command file and its registry metadata was corrected from `deferred` to `existing`.

Rule:

- Do not use the old `11/6/12` command-surface distribution in future planning.

### 6.2 Trigger Metadata

Older state:

- Sprint 02 reported 16 skills lacking trigger arrays.

Later state:

- Sprint 03A/03A-R reconciled trigger decisions and GitNexus path issues.
- Sprint 03B added trigger arrays to four approved `SKILL.md` files.
- Sprint 03B-V validated trigger patching.
- Sprint 04A through 04C-H completed invocation metadata and lifecycle-status repair.

Current interpretation:

- Do not treat “16 missing triggers” as current blocker without rechecking the manifest.
- It remains historically relevant because it explains why Sprint 03A and Sprint 03B existed.

### 6.3 Lifecycle Status

Bad intermediate state:

- Sprint 04B import changed status semantics to something like `23 active`, `6 reference`, `0 unknown`.

Corrected state:

- Sprint 04C restored lifecycle status to:
  - `active: 5`
  - `unknown: 24`
  - `reference: 0`

Header correction:

- Sprint 04C-H fixed stale top-level `metadata.active_count` and added/confirmed:
  - `active_count: 5`
  - `by_lifecycle_status`
  - `metadata_coverage_count: 29`

Rule:

- Never infer lifecycle promotion from file edits, recent session notes, command creation, or metadata coverage.

### 6.4 GitNexus Path

Incorrect interpretation:

- Some early work treated GitNexus skills as nonexistent because it searched flat skill paths.

Correct interpretation:

- GitNexus skills are nested under:
  - `.claude/skills/gitnexus/*/SKILL.md`

Current accepted state:

- Six GitNexus nested skills exist and are part of the 29 registered skills.

### 6.5 Enterprise Readiness Language

Incorrect interpretation:

- Sprint 01’s “Enterprise Gates: 6/6 PASS” and similar language sounded like actual enterprise safety enforcement.

Correct interpretation:

- Those were baseline availability checks, not enterprise gates.

Current rule:

- Use strict readiness labels.
- Do not call Yuri OS / Yuri enterprise-ready or production-ready.
- Acceptable phrasing: “committed baseline,” “scaffolded governance,” “audit-oriented baseline,” or “foundation-stage reinforcement state.”

---

## 7. Current Readiness Status

| Area | Current status | Notes |
|---|---:|---|
| Audit mode | partially enforced / scaffolded | Audit gate and test harness exist, but full automated enforcement is not proven. |
| Authority model | partially enforced / scaffolded | Project owner final authority; Claude local evidence wins; enforcement is not fully proven. |
| Sandbox | unknown / missing | No confirmed hard sandbox, Docker/chroot containment, or equivalent runtime isolation. |
| Policy engine | scaffolded / missing | CLAUDE.md and prompts provide policy, but complete enforceable policy engine is not proven. |
| Evidence discipline | partially enforced | Reports, validations, and count reconciliations are used, but many claims still depend on Claude reports. |
| Rollback | scaffolded | Baseline commits create rollback points; no tested rollback procedure was reported. |
| Telemetry | scaffolded | Hooks/status/session artifacts exist, but telemetry reliability and retention are unresolved. |
| Prompt injection defense | unknown / missing | No full prompt-injection audit was completed. |
| Test coverage | scaffolded | `test-harness.js` exists; broad coverage is not proven. |
| Enterprise readiness | missing | Do not claim. |
| Production readiness | missing | Do not claim. |

---

## 8. CLI and Model Routing

### Claude Code CLI

Role:

- Primary local filesystem executor and validator.

Use for:

- repo-local evidence checks,
- `.claude/skills/`, `.claude/agents/`, `.claude/reinforcement/`, `.claude/commands/`, `.claude/hooks/`,
- exact-path file creation and validation,
- narrow git mutation sprints when explicitly authorized,
- evidence-based completion reports.

Rules:

- No broad mutation.
- No automation without explicit sprint permission.
- No modifying hooks, CI/CD, permissions, package files, commands, agents, SKILL.md files, or registry unless the sprint explicitly allows it.
- Protected `.claude/` files should be written as one complete write per file, not line-by-line edits.
- Use exact file paths only for commit execution.
- Local file evidence from Claude beats GPT planning assumptions.

### Codex CLI

Role:

- Secondary execution and audit lane.
- Close to Claude in repo context and reinforcement setup, but not a clone.

Best used for:

- deterministic validation,
- manifest consistency checks,
- schema validation,
- test harness improvements,
- script review,
- patch review,
- CI-style checks,
- verifying Claude outputs,
- detecting inflated readiness claims.

Avoid:

- broad symbolic redesign,
- mythology expansion,
- destructive refactors,
- claiming production readiness,
- acting as the only strategic planner.

### Gemini CLI

Role:

- Backup / large-context audit lane and secondary validator after setup.

Current status:

- Gemini CLI parity setup was planned but not completed in the latest session.
- Gemini should not be treated as source of truth yet.

Best used for:

- broad-context audits,
- long-file comparison,
- finding what Claude/Codex missed,
- fallback review when Claude or Codex context is constrained.

Rules:

- Read-only by default until validated.
- No commits, hooks, registry, commands, or SKILL.md edits until parity setup passes.
- Not source of truth.

### GPT-5.5

Role:

- Strategic continuity brain, prompt architect, sprint gatekeeper, consistency auditor.

Use for:

- deciding the next safest task,
- writing Claude/Codex/Gemini prompts,
- reviewing reports for count mismatches and scope drift,
- detecting overclaims,
- preserving trusted state,
- keeping the system in boring reinforcement until enforcement improves.

Project-specific prompt convention:

- Every Claude prompt for Yuri OS / Yuri should include a `GPT-5.5 Help Context` block summarizing:
  - gate decisions,
  - trusted state,
  - risks,
  - exact instructions.

### GPT-5.4

Role:

- Strategic support / secondary reasoning model.

Use for:

- second-pass review,
- prompt refinement,
- alternate critique,
- context compression.

### VS Code

Role:

- Main IDE for Yuri OS / Yuri work.

Assumption:

- Claude Code CLI/plugin, Codex CLI, and Gemini CLI workflows are expected to run around VS Code as the central working environment.

---

## 9. Permission and Safety Context

Permission hardening happened before the later reinforcement baseline.

Accepted direction:

- Do not use prompt-based “special permission,” “self accept,” or policy override language.
- Use Claude Code’s official `allow`, `ask`, and `deny` permission structure.
- Keep destructive and sensitive operations denied.
- Keep normal package installs ask-gated, not silently allowed.

Known caveat:

- One permission smoke-test report had contradictory wording around dependency installs being “ALLOWED.”
- The intended policy is ask-gated normal installs.
- Verify actual `.claude/settings.local.json` before relying on it.

---

## 10. Files and Artifacts to Know

### Core reinforcement files

- `.claude/reinforcement/skill-manifest.json`
- `.claude/reinforcement/agent-manifest.json`
- `.claude/reinforcement/audit-gate.js`
- `.claude/reinforcement/test-harness.js`

### Core policy/context file

- `.claude/CLAUDE.md`

### Command directory

- `.claude/commands/`
- User-global equivalent was reported synced/identical:
  - `/Users/marcelspatz/.claude/commands/`

### Accepted command files

- `.claude/commands/bg.md`
- `.claude/commands/compact-optimizer.md`
- `.claude/commands/graphify.md`
- `.claude/commands/tokenmaxxing.md`
- `.claude/commands/local-subagent.md`
- `.claude/commands/end-of-transmission.md`
- `.claude/commands/eot.md`
- `.claude/commands/reflect.md`
- `.claude/commands/yuri-dna-ingest.md`
- `.claude/commands/yuri-domain.md`
- `.claude/commands/yuri-zenkai.md`
- `.claude/commands/yuri-guard.md`
- `.claude/commands/yuri-clone.md`
- `.claude/commands/yuri-pattern-mirror.md`
- `.claude/commands/sharingan.md`

### Skill directory

- `.claude/skills/`

### GitNexus nested skills

- `.claude/skills/gitnexus/cli/SKILL.md`
- `.claude/skills/gitnexus/debugging/SKILL.md`
- `.claude/skills/gitnexus/exploring/SKILL.md`
- `.claude/skills/gitnexus/guide/SKILL.md`
- `.claude/skills/gitnexus/impact-analysis/SKILL.md`
- `.claude/skills/gitnexus/refactoring/SKILL.md`

### Hook files mentioned

- `.claude/hooks/nisaba-subagent-start.js`
- `.claude/hooks/pre-tool-use.js`
- `.claude/hooks/startup-offload.js`
- `.claude/hooks/token-session-end.js`
- `.claude/hooks/token-session-init.js`
- `.claude/hooks/token-status.js`
- `.claude/hooks/session-reflect.js`

### Candidate / non-registry areas

- `.agents/skills/oracle-*`
  - Whole-repo census found 5 oracle candidate skills.
  - Do not include them in active registry by default.

- `.claude/plugins/`
  - Plugin/example/reference ecosystem.
  - Not active registry authority by default.

- `.agents/skills/anime-dna-extensions/`
  - Extension pack / duplicate ecosystem.
  - Later owner review only.

### Ephemeral/noise areas

- `.claude/memory-sessions/`
- `.claude/sessions/`
- `.claude/shell-snapshots/`
- `.claude/ide/`
- `.claude/debug/latest`
- `.claude/history.jsonl`
- `.claude/memory-bus.json`

These need policy review before cleanup or ignore changes.

---

## 11. Warnings for Future Sessions

Do not:

- claim enterprise readiness,
- claim production readiness,
- say enterprise gates are enforced,
- use obsolete command-surface counts,
- treat `eot.md` as an orphan,
- treat `yuri-dna-ingest.md` as a separate skill,
- create `yuri-*` skill directories,
- infer lifecycle promotion from recent edits or session notes,
- treat `oracle-*` skills as active registry skills by default,
- assume Gemini CLI is ready or trusted,
- assume sandboxing, rollback, telemetry, prompt-injection defense, or policy enforcement is complete,
- silently stage/commit tracked deletions,
- use broad git globs for baseline or cleanup commits,
- allow normal dependency installs silently,
- use prompt-based permission-bypass language.

Do:

- keep boring reinforcement priority,
- require evidence reports,
- reconcile counts before mutation,
- use exact paths,
- prefer read-only validation before writes,
- treat Claude Code as primary local executor,
- use Codex as deterministic validator/secondary engineering lane,
- use Gemini as backup/large-context support only after setup,
- keep GPT-5.5 as external gatekeeper and continuity brain.

---

## 12. Next Recommended Task

### Sprint 06E-V — Post-Baseline Commit Validation

Reason:

Sprint 06E committed a major baseline. Before cleanup, hook hardening, lifecycle review, Gemini parity, or any expansion, verify that the committed state still matches trusted counts and that no accepted baseline files remain dirty or missing.

Executor:

- Claude Code CLI

Validator:

- GPT-5.5
- Optional later cross-check: Codex CLI

Expected output:

- Confirm latest five Sprint 06E commits exist on `main`.
- Confirm registry parses.
- Confirm total skills: `29`.
- Confirm lifecycle status: `active: 5`, `unknown: 24`, `reference: 0`.
- Confirm command surface: `existing: 12`, `deferred: 5`, `none: 12`.
- Confirm accepted command files: `15`.
- Confirm existing-status command coverage: `12/12`.
- Confirm no accepted baseline files remain unstaged/dirty.
- Report remaining known git noise separately.
- No file modifications.

Suggested sequence after 06E-V:

1. Sprint 07A — Ephemeral Artifact Policy Audit
2. Sprint 07B — Ephemeral Cleanup Plan
3. Sprint 07C — tokenmaxxing Hook Regex Safety Patch
4. Sprint 07C-V — Hook Safety Validation
5. Sprint 07D — EOT MANGEKYO Phase 5.5 Scale Validation Plan
6. Sprint 07E — LLM-Wiki Overlay Stability Audit
7. Phase 0C — Lifecycle Status Review
8. oracle-* Candidate Review
9. New expansion / anime DNA powers

---

## 13. Ready-to-Paste Claude Prompt: Sprint 06E-V

```text
# Sprint 06E-V — Post-Baseline Commit Validation

## GPT-5.5 Help Context

GPT-5.5 cross-checked the current session reports and resolved the latest accepted state as follows:

- Latest accepted baseline is Sprint 06E on branch `main`.
- Five expected commits:
  - `19ec4ac9 feat(reinforcement): baseline skill and agent registries`
  - `a8c88c38 feat(commands): baseline Yuri OS command surface`
  - `753df8fd docs(skills): baseline reviewed skill documentation updates`
  - `b940f900 feat(skills): add Yuri OS core skill directories`
  - `5b4ad58c refactor(infrastructure): baseline Claude policy and hooks`
- Registry path:
  - `/Users/marcelspatz/YURI-OS-MUSUBI/.claude/reinforcement/skill-manifest.json`
- Expected manifest version:
  - `1.0.2`
- Expected skill counts:
  - total skills: `29`
  - top-level skills: `23`
  - GitNexus nested skills: `6`
  - metadata coverage count: `29`
- Expected lifecycle status:
  - `active: 5`
  - `unknown: 24`
  - `reference: 0`
- Expected command surface status:
  - `existing: 12`
  - `deferred: 5`
  - `none: 12`
- Expected existing-status command coverage:
  - `12/12`
- Expected accepted command files:
  - `15`
- Known non-blocking noise:
  - `1,162` tracked deletions were previously triaged as mostly ephemeral/session/snapshot/lock artifacts.
- Important warnings:
  - Do not use obsolete command-surface counts `existing: 11`, `deferred: 6`, `none: 12`.
  - Do not create yuri-* skill directories.
  - Do not treat `eot.md` as an orphan.
  - Do not treat `yuri-dna-ingest.md` as a separate skill.
  - Do not infer lifecycle status from recent edits or session notes.
  - Do not claim enterprise readiness or production readiness.
  - Do not modify files in this sprint.

## Task

Run a read-only post-baseline validation of the Sprint 06E committed state.

## Scope

Read only. No file modifications. No staging. No commits. No cleanup. No `.gitignore` changes. No hook edits. No registry edits. No SKILL.md edits. No command edits.

## Validate

1. Confirm current branch.
2. Confirm the five expected Sprint 06E commits exist on `main`.
3. Confirm `skill-manifest.json` parses.
4. Confirm manifest version if present.
5. Confirm total skill count is `29`.
6. Confirm top-level vs GitNexus nested count if available.
7. Confirm lifecycle status distribution:
   - `active: 5`
   - `unknown: 24`
   - `reference: 0`
8. Confirm `metadata_coverage_count: 29`.
9. Confirm command surface status distribution:
   - `existing: 12`
   - `deferred: 5`
   - `none: 12`
10. Confirm accepted command file count is `15`.
11. Confirm existing-status command coverage is `12/12`.
12. Confirm no accepted baseline files remain unstaged/dirty.
13. Report remaining git noise separately.
14. Confirm whether the known 1,162 tracked deletions still exist and whether they still appear non-baseline/ephemeral.

## Output

Produce a concise Markdown report with:

- Result: PASS / PASS WITH WARNINGS / FAIL
- Evidence summary
- Exact counts observed
- Any mismatch against GPT-5.5 expected state
- Dirty/untracked/deleted baseline file status
- Remaining known noise
- Recommended next sprint

Do not fix anything in this sprint.
```

---

## 14. Machine-Readable Summary

```json
{
  "project": "Yuri OS / Yuri",
  "prepared_for": "Marcel UwU project source",
  "date": "2026-04-27",
  "document_type": "cross_session_source_context",
  "latest_accepted_sprint": "Sprint 06E",
  "next_recommended_sprint": "Sprint 06E-V Post-Baseline Commit Validation",
  "branch": "main",
  "baseline_commits": [
    "19ec4ac9",
    "a8c88c38",
    "753df8fd",
    "b940f900",
    "5b4ad58c"
  ],
  "registry": {
    "path": "/Users/marcelspatz/YURI-OS-MUSUBI/.claude/reinforcement/skill-manifest.json",
    "manifest_version_reported": "1.0.2",
    "total_skills": 29,
    "top_level_skills": 23,
    "gitnexus_nested_skills": 6,
    "metadata_coverage_count": 29,
    "lifecycle_status": {
      "active": 5,
      "unknown": 24,
      "reference": 0
    },
    "command_surface_status": {
      "existing": 12,
      "deferred": 5,
      "none": 12
    },
    "existing_status_command_coverage": "12/12",
    "accepted_command_files": 15
  },
  "agents": {
    "agent_manifest_path": "/Users/marcelspatz/YURI-OS-MUSUBI/.claude/reinforcement/agent-manifest.json",
    "reported_agent_count": 11,
    "model_assignment_gap_from_sprint_02": [
      "argus",
      "cassandra",
      "hermes",
      "noesis-linter",
      "obliteratus-qa"
    ],
    "current_model_assignment_status": "needs recheck"
  },
  "cli_routing": {
    "claude_code_cli": "primary local executor and validator",
    "codex_cli": "secondary deterministic validation and engineering lane",
    "gemini_cli": "backup large-context audit lane, not source of truth until setup passes",
    "gpt_5_5": "strategic continuity, prompt architecture, gate review",
    "gpt_5_4": "secondary strategic reasoning support",
    "vscode": "main IDE"
  },
  "superseded_counts": {
    "old_command_surface_status": {
      "existing": 11,
      "deferred": 6,
      "none": 12
    },
    "current_command_surface_status": {
      "existing": 12,
      "deferred": 5,
      "none": 12
    }
  },
  "readiness": {
    "enterprise_ready": false,
    "production_ready": false,
    "audit_mode": "partially_enforced_or_scaffolded",
    "authority": "partially_enforced_or_scaffolded",
    "sandbox": "unknown_or_missing",
    "policy": "scaffolded_or_missing",
    "rollback": "scaffolded_but_not_tested",
    "telemetry": "scaffolded",
    "prompt_injection_defense": "unknown_or_missing",
    "test_coverage": "scaffolded_not_comprehensive"
  },
  "known_non_blocking_work": [
    ".gitignore / ephemeral artifact policy",
    "tokenmaxxing hook regex safety / silent-failure guard",
    "EOT MANGEKYO Phase 5.5 scale validation",
    "EOT LLM-Wiki overlay stability validation",
    "oracle-* candidate review",
    "Gemini CLI parity setup"
  ],
  "do_not_do": [
    "do not claim enterprise readiness",
    "do not claim production readiness",
    "do not use obsolete command-surface counts",
    "do not create yuri-* skill directories",
    "do not infer lifecycle promotion from file activity",
    "do not treat oracle-* as active registry by default",
    "do not stage tracked deletions without explicit cleanup sprint",
    "do not treat Gemini CLI as source of truth yet"
  ]
}
```
