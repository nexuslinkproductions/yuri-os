# OpenSpace

**Status:** Active Implementation  
**Location:** `./openspace/`  
**Repository:** https://github.com/HKUDS/OpenSpace

---

## What is OpenSpace?

OpenSpace is an **open-source self-evolving engine for AI agents** that automatically improves skills, reduces token costs, and enables knowledge sharing across agents.

### Key Features
- **Self-Evolution**: Skills automatically improve and optimize over time
- **Token Cost Reduction**: 46% reduction in token usage (benchmark: 50 real-world tasks)
- **Performance Improvement**: 4.2× performance gain on professional tasks
- **Skill Sharing**: Cloud-based skill community for knowledge exchange
- **MCP Integration**: Model Context Protocol server support
- **Local Persistence**: Skill management and versioning

---

## Project Structure

```
openspace/
├── openspace/           # Core Python package
│   ├── engine/          # Self-evolution engine
│   ├── skills/          # Skill management
│   └── mcp/             # MCP server
├── frontend/            # React dashboard (Node.js ≥20)
├── gdpval_bench/        # Benchmark suite
├── showcase/            # Example: "My Daily Monitor" (60+ evolved skills)
├── docs/                # Comprehensive documentation
└── README.md            # Setup & configuration
```

---

## Quick Start

### Requirements
- Python 3.12+
- Node.js ≥20 (for frontend)
- Claude API key (for AI agent capabilities)

### Installation
```bash
cd openspace
pip install -e .
```

### Run Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```

---

## Key Files & Documentation

| File | Purpose |
|------|---------|
| `README.md` | Complete setup guide |
| `INSTALLATION.md` | Detailed installation steps |
| `CONFIG.md` | Configuration options |
| `API.md` | API documentation |
| `showcase/` | Live example: AI-built dashboard |
| `gdpval_bench/` | Performance benchmarks |

---

## Next Steps

- [ ] Review README and installation docs
- [ ] Set up Python environment & dependencies
- [ ] Configure Claude API integration
- [ ] Explore skill evolution examples
- [ ] Run benchmarks to understand performance
- [ ] Deploy frontend dashboard

---

## Notes

- Self-learning agents improve skills through iterative optimization
- Skills can be versioned and shared across agent networks
- Dashboard visualizes skill lineage and execution metrics
- Showcase example demonstrates 60+ evolved skills in production use

---

**Created:** 2026-04-11
