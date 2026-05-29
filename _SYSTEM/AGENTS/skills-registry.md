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
| ai-pipeline-offloading | automatic | Task offloading across model lanes |
| browser-automation | automatic | Browser control and web scraping |
| design-master | design | Design system and visual architecture |
| frontend-design | frontend-design | Anti-generic frontend design workflow, source selection, motion budget, and browser verification |
| prompt-engineering | prompt, prompt audit, prompting strategy | Source-backed prompt design as task contracts with evidence, constraints, tool policy, schemas, and evals |
| sales-psychology | sales, buyer psychology, objection, close, NEPQ, Jeremy Miner, Raving Fans, Jungian | Evidence-tiered sales reasoning with positive signals, omissions, depth-psychology hypotheses, and ethical guardrails |
| probabilistic-decision-core | `/yuri probability` | Probability, expected value, and calibration for operational decisions |
| swarm-coordination | automatic | Multi-agent coordination |
| taskflow | automatic | Task flow management |

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
| obliteratus | [_SYSTEM/Scripts/offload-contract.mjs](</Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/Scripts/offload-contract.mjs>) / [spec](</Users/marcelspatz/YURI-OS-MUSUBI/.claude/agents/obliteratus-qa.md>) | `gitnexus-impact-analysis`, `gitnexus-pr-review`, `failure-evolution-loop` | Act as an explicit pre-promotion adversarial gate for high-stakes reviews, protocol changes, sandbox promotion candidates, protected-state changes, and durable learning promotion. |

## Integration Notes
- Matt Pocock skills are promoted into root `skills/<skill-id>/`
- Yuri OS canonical skills are at root `skills/`
- All skills are loaded by OpenClaw on session boot
- Skills can be invoked by slash command or triggered automatically
- Cross-domain lesson indexing lives in `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-taxonomy.md`, `cross-reference-index.md`, and `prevention-rules.md`; keep canonical tags when promoting memory or summarized logs.
