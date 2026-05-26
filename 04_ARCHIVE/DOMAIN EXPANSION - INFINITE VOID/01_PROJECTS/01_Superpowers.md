# Superpowers

**Status:** Active Implementation  
**Location:** `./superpowers/`  
**Repository:** https://github.com/obra/superpowers  
**GitHub Stars:** 146K | **Forks:** 12.5K

---

## What is Superpowers?

Superpowers is a **composable skills framework** that enhances AI coding agents (Claude, Cursor, Codex, Copilot, Gemini) with structured development workflows and methodologies.

### Core Philosophy
Rather than agents jumping directly into code, Superpowers guides them through deliberate phases:
1. **Design Refinement** — Planning and architecture
2. **Planning** — Structured task breakdown
3. **Test-Driven Implementation** — Tests first, then code
4. **Code Review** — Built-in quality gates

### Key Features
- **Composable Skills Library** — Reusable workflows that trigger at appropriate moments
- **Evidence-Based Development** — Systematic debugging over guessing
- **Subagent Workflows** — Agents autonomously execute plans with review
- **Multi-Platform Support** — Claude Code, Cursor, Codex, OpenCode, GitHub Copilot CLI, Gemini CLI
- **Test-First Approach** — Enforces systematic quality control

---

## Project Structure

```
superpowers/
├── skills/              # Reusable skill library
├── frameworks/          # Development methodologies
├── examples/            # Integration examples
├── docs/                # Comprehensive documentation
├── README.md            # Overview & setup
└── LICENSE              # MIT
```

---

## Supported Platforms

| Platform | Support |
|----------|---------|
| Claude Code | ✓ Full |
| Cursor | ✓ Full |
| Codex | ✓ Full |
| OpenCode | ✓ Full |
| GitHub Copilot CLI | ✓ Full |
| Gemini CLI | ✓ Full |

---

## Key Concepts

### Skills
Reusable, composable workflows that integrate with IDE and CLI tools. Skills automatically trigger at appropriate development phases.

### Methodologies
- **Test-Driven Development**: Write tests before implementation
- **Systematic Debugging**: Evidence-based troubleshooting
- **Collaborative Workflows**: Multi-agent coordination
- **Code Review Gates**: Quality enforcement

### Subagent Architecture
Agents can spawn child agents to execute specific tasks autonomously while maintaining oversight and review.

---

## Integration Points

- Claude Code integration via skills
- Cursor IDE customization
- Copilot CLI automation
- Standalone framework for custom agents

---

## Next Steps

- [ ] Review README and documentation
- [ ] Explore skills library structure
- [ ] Understand framework methodologies
- [ ] Integrate with current AI agent workflows
- [ ] Test skills with OpenSpace agents

---

## Relationship to OpenSpace

Superpowers provides **structural workflows** while OpenSpace provides **self-evolving skills**. Together they can create AI agents that:
- Evolve and improve automatically (OpenSpace)
- Follow structured development methodologies (Superpowers)

---

**Created:** 2026-04-11
