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
| swarm-coordination | automatic | Multi-agent coordination |
| taskflow | automatic | Task flow management |

## Integration Notes
- Matt Pocock skills are installed at `.agents/skills/mattpocock/`
- Yuri OS native skills are at `.agents/skills/`
- All skills are loaded by OpenClaw on session boot
- Skills can be invoked by slash command or triggered automatically
