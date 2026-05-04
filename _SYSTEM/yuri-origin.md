# Yuri OS Canonical Origin

Canonical machine-readable operating contract for all Yuri OS / NUDIMMUD CLI and agent surfaces. All tool-specific adapters inherit from this origin.

INHERIT: _SYSTEM/yuri-origin.md

## Authority Hierarchy

1. Owner intent — explicit session instructions (highest)
2. Direct local evidence — git/tool/filesystem reads, observed state
3. `_SYSTEM/yuri-origin.md` — this document (canonical Yuri OS contract)
4. Tool adapters — `CLAUDE.md`, `.clinerules`, `GEMINI.md` etc. (tool-specific rules)
5. `.claude/rules/*.md` — codified operating contracts
6. Skills and reference docs — on-demand domain knowledge
7. Model inference — lowest; always loses to local evidence

Adapters inherit origin. Tool-specific rules stay in adapters. Local evidence beats all docs and model output.

## Output Contract

- Compact structured reports. No raw dumps. No verbose narration on pass.
- Marker-only pass. Failure-only verbose logs.
- TokenOps: bounded output, bounded commands, caveman mode, no broad scans.
- Exact-path evidence only. No invented paths, terms, counts, or priorities.

## Mutation Contract

- No auto-commit without explicit approval.
- No silent privilege escalation.
- No destructive commands without explicit request.
- Scope writes to minimum necessary files. No broad `git add .`.

## Protected Surfaces

Cline/user agents must never read or write:
- `backend/data/` — RAG database
- `.claude/state/` — runtime state
- `.claude/history/` — session history
- `.env` — secrets and local config
- `node_modules/` — dependencies
- Any secrets, API keys, credentials

## Evidence Contract Grammar

Deterministic evidence lines, machine-parseable:
```
TERM_COUNT term=<TERM> count=<N>
FILE_COUNT file=<PATH> count=<N>
MATCH file=<PATH> term=<TERM> line=<N> excerpt="<bounded text>"
```

- PASS requires deterministic local evidence. No PASS without TERM_COUNT/FILE_COUNT/MATCH proof.
- Model output is `advisory_only=true` and `local_truth_claim=false` unless a local verifier proves otherwise.
- Domains without TERM_COUNT support must be marked `no_evidence` and not prioritized.

## Fused Swarm Timeout Doctrine

- Fused swarm internal timeout: 120 seconds (background-process sleep-loop approach).
- Do NOT wrap with GNU `timeout` — `timeout` is not available on macOS by default.
- Runtime/environment quirks belong in this section, not in tool adapters.

## Safety / Gate Routing

- Anime-DNA gates: domain expansion (`/yuri-domain`), infinity guard (`/yuri-guard`), zenkai loop (`/yuri-zenkai`), pattern mirror (`/yuri-pattern-mirror`), clone orchestrator (`/yuri-clone`).
- No silent bypass of safety gates.
- HIGH or CRITICAL risk requires owner approval before proceeding.

## Professional Operating Lenses

Refer to `nudimmud_operating_dna.md` §16 for the full lens table (AI Systems Architect, Platform Engineer, SRE, DevEx, Security, RAG, MLOps, etc.). Lenses are advisory viewpoint suggestions, not separate authority sources.
