# Yuri OS Skills Registry

## Matt Pocock Skills (integrated 2026-05-05)

### Engineering
| Skill | Trigger | Purpose |
|-------|---------|---------|
| diagnose | `/diagnose` | Error diagnosis and root cause analysis |
| grill-with-docs | `/grill-with-docs` | Requirements alignment with documentation review |
| improve-codebase-architecture | `/improve-codebase-architecture` | Codebase structure improvement |
| tdd | `/tdd` | Test-driven development workflow |
| to-issues | `/to-issues` | Create issues from PRDs/specs |
| to-prd | `/to-prd` | Create Product Requirement Documents |
| triage | `/triage` | Issue triage and prioritization |
| zoom-out | `/zoom-out` | Architecture review and big-picture analysis |

### Productivity
| Skill | Trigger | Purpose |
|-------|---------|---------|
| caveman | `/caveman` | Terse, functional communication |
| grill-me | `/grill-me` | Requirements alignment before starting work |
| write-a-skill | `/write-a-skill` | Create new skills |

### Infrastructure
| Skill | Trigger | Purpose |
|-------|---------|---------|
| setup-matt-pocock-skills | `/setup-matt-pocock-skills` | One-time skill setup and configuration |
| git-guardrails-claude-code | automatic | Git safety guardrails for Claude Code |
| setup-pre-commit | automatic | Pre-commit hook setup |

## Yuri OS Native Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| oracle-adapters | oracle-adapters | Build compatibility adapters |
| oracle-memory | oracle-memory | Build Oracle memory surfaces |
| oracle-registry | oracle-registry | Build Oracle registry surfaces |
| oracle-router | oracle-router | Build Oracle task routing |
| oracle-voice | oracle-voice | Build Oracle voice surfaces |
| design-master | design | Design system and visual architecture |
| frontend-design | frontend-design | Anti-generic frontend design workflow, source selection, motion budget, and browser verification |
| prompt-engineering | prompt, prompt audit, prompting strategy | Source-backed prompt design as task contracts with evidence, constraints, tool policy, schemas, and evals |
| sales-psychology | sales, buyer psychology, objection, close, NEPQ, Jeremy Miner, Raving Fans, Jungian | Evidence-tiered sales reasoning with positive signals, omissions, depth-psychology hypotheses, and ethical guardrails |
| probabilistic-decision-core | `/yuri probability` | Probability, expected value, and calibration for operational decisions |

## Agent Linkage

| Agent | Doc | Linked skills | Best for |
|-------|-----|---------------|----------|
| architect | [`.claude/agents/architect.md`](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/agents/architect.md>) | `execution-domain-core`, `swarm-coordination`, `parallel-clone-orchestrator`, `gitnexus-exploring`, `gitnexus-impact-analysis`, `non-destructive-infinity-guard` | architecture reviews, staged integration plans, blast-radius checks |
| doc-cleaner | [`.claude/agents/doc-cleaner.md`](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/agents/doc-cleaner.md>) | `openai-codex-workflow`, `codebase-to-course`, `graphify` | markdown cleanup, doc normalization, structure extraction |
| file-inventory | [`.claude/agents/file-inventory.md`](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/agents/file-inventory.md>) | `gitnexus-exploring`, `graphify`, `sharingan` | inventories, entrypoint mapping, duplicate detection |
| log-summarizer | [`.claude/agents/log-summarizer.md`](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/agents/log-summarizer.md>) | `end-of-transmission`, `failure-evolution-loop`, `compact-optimizer` | log compression, error traces, open-question capture |
| memory-curator | [`.claude/agents/memory-curator.md`](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/agents/memory-curator.md>) | `end-of-transmission`, `failure-evolution-loop`, `non-destructive-infinity-guard` | memory promotion review, durable fact extraction |
| security-reviewer | [`.claude/agents/security-reviewer.md`](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/agents/security-reviewer.md>) | `non-destructive-infinity-guard`, `gitnexus-impact-analysis`, `gitnexus-pr-review` | permission review, sandbox checks, rollback validation |

## Native Function Linkage

| Native function | Runtime owner | Linked skills | What Yuri can do with it |
|-----------------|---------------|---------------|--------------------------|
| argus | [`.claude/hooks/scout-runner.js`](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/hooks/scout-runner.js>) / [spec](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/agents/argus.md>) | `oracle-router`, `gitnexus-impact-analysis`, `non-destructive-infinity-guard` | Catch tool-call sequencing errors, failed-edit assumptions, direct canonical-memory touches, and commit-without-scope-evidence before they become session claims. |
| obliteratus | [_SYSTEM/Scripts/llm-compat-contract.mjs](</Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/llm-compat-contract.mjs>) / [spec](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/agents/obliteratus-qa.md>) | `gitnexus-impact-analysis`, `gitnexus-pr-review`, `failure-evolution-loop` | Act as an explicit pre-promotion adversarial gate for high-stakes reviews, protocol changes, sandbox promotion candidates, protected-state changes, and durable learning promotion. |

## Integration Notes
- Matt Pocock skills are promoted into root `skills/<skill-id>/`
- Yuri OS canonical skills are at root `skills/`
- All skills are loaded by OpenClaw on session boot
- Skills can be invoked by slash command or triggered automatically
- Cross-domain lesson indexing lives in `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-taxonomy.md`, `cross-reference-index.md`, and `prevention-rules.md`; keep canonical tags when promoting memory or summarized logs.

## Claude Skills (`.claude/skills/`) — registry completion (wave-2, 2026-06-10)

Every `.claude/skills/<id>/SKILL.md` must have a row here (lint: `node _SYSTEM/Scripts/skills-registry-lint.mjs`).
The 8 `organ-*` skills are Claude-only (no `.agents/skills/` mirror).

| Skill | Trigger | Purpose |
|-------|---------|---------|
| adversarial-verification | `model-invocable` | Use when verifying completed work, reviewing Claude or Codex output, wiring routes or adapters, relaunching lanes, committing, pushing, or a |
| anthropic-managed-agents | `model-invocable` | Research Anthropic managed agents, sessions, events, tools, and skills, then distill the architecture into a portable agent brief |
| bankai-manifest | `/bankai` | Full Externalize Mode — on CRITICAL complexity tasks, Musubi fully externalizes its cognitive state as a structured manifest (goal tree, ris |
| bg | `/bg` | Background task router |
| claude-codex-capability-bridge | `model-invocable` | Use when a Claude lane needs help from Codex-developed plugins, plugin-provided skills, app connectors, MCP tools, browser/design/cloud/GitH |
| claude-output-lane | `model-invocable` | Use whenever Claude produces reusable output inside YURI-OS-MUSUBI, including plans, ideas, findings, reviews, draft artifacts, diff proposa |
| codebase-to-course | `turn this into a course` | Turn any codebase into a beautiful, interactive single-page HTML course that teaches how the code works to non-technical people |
| compact-optimizer | `/compact` | Construct the minimum-viable /compact hint |
| design-source-pack | `extract design system` | Catalog navigator and component extraction skill |
| end-of-transmission | `end of transmission` | Continuous background reflection engine |
| execution-domain-core | `/yuri domain` | Scoped execution environment, task policy, and exit criteria system for Yuri OS / Yuri |
| extraction-sprint | `extraction sprint` | Shintai council extraction template |
| failure-evolution-loop | `/yuri zenkai` | Real failure capture, root-cause analysis, regression creation, and memory-driven improvement for Yuri OS / Yuri |
| geass-lock | `/geass` | One-Shot Constraint Lock — user invokes with a constraint phrase; that constraint becomes absolutely inviolable for the session, visible in  |
| gitnexus | `model-invocable` | Unified GitNexus dispatcher for CLI, guide, exploration, debugging, PR review, impact analysis, and refactoring workflows. |
| haki-intent | `/haki` | Intent Pre-cognition Engine — model-invocable |
| izanagi-simulator | `/izanagi` | Counterfactual Simulation Engine — before committing to a high-stakes plan, generates 3 divergent alternate paths, evaluates each by EV/risk |
| nen-phase-detector | `/nen` | Adaptive Phase Specialization — model-invocable |
| non-destructive-infinity-guard | `/yuri guard` | Always-on action boundary, risk classifier, and mutation approval gate for Yuri OS / Yuri |
| openai-codex-workflow | `model-invocable` | Research and apply OpenAI/Codex workflow guidance, including docs, config, subagents, skills, memory, and local gpt-oss usage |
| organ-discovery-precision-gate | `organ-discovery-precision-gate` | Gates a lane claim against its WorkSubstrate scope + discovery footprint BEFORE the energy gate runs *(Claude-only, no `.agents/skills/` mirror)* |
| organ-filing-assessor | `organ-filing-assessor` | Deterministic, READ-ONLY placement assessor for YURI artifacts *(Claude-only, no `.agents/skills/` mirror)* |
| organ-formula-foundry | `organ-formula-foundry` | Formula Foundry typing CORE A — the legal-move generator *(Claude-only, no `.agents/skills/` mirror)* |
| organ-formula-foundry-bakeoff | `organ-formula-foundry-bakeoff` | Foundry CHUNK 3 — the bakeoff harness + the promotion/demotion ledger (the SCORER + GOVERNANCE side of Core B) *(Claude-only, no `.agents/skills/` mirror)* |
| organ-lane-telemetry-cockpit | `organ-lane-telemetry-cockpit` | Human-readable cockpit over the Originator lane-telemetry stream *(Claude-only, no `.agents/skills/` mirror)* |
| organ-openprocess-pool | `organ-openprocess-pool` | The OpenProcess Sum Pool — mathematical memory for started-but-unclosed work *(Claude-only, no `.agents/skills/` mirror)* |
| organ-yuri-decode | `organ-yuri-decode` | The LLM-WIELDED decoder instrument: translate text → a deterministic math object *(Claude-only, no `.agents/skills/` mirror)* |
| organ-yuri-nerve | `organ-yuri-nerve` | The nervous-system spine + afferent nerve *(Claude-only, no `.agents/skills/` mirror)* |
| parallel-clone-orchestrator | `/yuri clone` | Budgeted multi-agent decomposition, specialist execution, and synthesis — runs natively via the Workflow tool (parallel/pipeline fan-out und |
| pattern-mirror-core | `/yuri pattern-mirror` | Artifact perception, pattern extraction, weakness detection, and yuri-native reconstruction for Yuri OS / Yuri |
| research-artifact-factory | `convert this research into a skill` | Convert mature research notes into draft Codex skills and supporting tool scaffolds |
| sharingan | `/sharingan` | User-invoked reverse-engineering + enhancement protocol for any source artifact: repos, codebases, docs, PDFs, screenshots, specs, workflows |
| systematic-debugging | `model-invocable` | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes |
| tokenmaxxing | `tokenmaxxing` | Native token efficiency mode (auto-activated at SessionStart) |
| verification-before-completion | `model-invocable` | Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and  |
| visual-introspection | `/introspect` | Engineering visual analysis of the Yuri OS architecture graph |
| writing-plans | `model-invocable` | Use when you have a spec or requirements for a multi-step task, before touching code |
| yuri-code-intelligence | `/code-intelligence` | Unified code quality intelligence layer synthesized from Fowler refactoring patterns, class responsibility realignment, web presentation pat |
| yuri-sales-intelligence | `/sales-intelligence` | Unified sales and outreach intelligence skill |
| yuri-shura | `/shura` | 6-perspective adversarial review for high-stakes turns (architecture decisions, refactor planning, deployment review) |
| brainstorming | `model-invocable` | "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior |
| dispatching-parallel-agents | `model-invocable` | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies |
| executing-plans | `model-invocable` | Use when you have a written implementation plan to execute in a separate session with review checkpoints |
| gitnexus-debugging | `model-invocable` | "Use when the user is debugging a bug, tracing an error, or asking why something fails |
| gitnexus-impact-analysis | `model-invocable` | "Use when the user wants to know what will break if they change something, or needs safety analysis before editing code |
| gitnexus-refactoring | `model-invocable` | "Use when the user wants to rename, extract, split, move, or restructure code safely |
| receiving-code-review | `model-invocable` | Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - |
| requesting-code-review | `model-invocable` | Use when completing tasks, implementing major features, or before merging to verify work meets requirements |
| subagent-driven-development | `model-invocable` | Use when executing implementation plans with independent tasks in the current session |
| test-driven-development | `model-invocable` | Use when implementing any feature or bugfix, before writing implementation code |
| using-git-worktrees | `model-invocable` | Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated wo |
| writing-skills | `model-invocable` | Use when creating new skills, editing existing skills, or verifying skills work before deployment |
