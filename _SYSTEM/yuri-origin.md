# Yuri OS Canonical Origin

Canonical operating contract for all Yuri OS / NUDIMMUD CLI and agent surfaces. This file is the authority layer; adapters only add surface-specific launch or compatibility rules.

## Authority Hierarchy

1. Owner intent - explicit session instructions
2. Direct local evidence - git/tool/filesystem reads and observed state
3. `_SYSTEM/yuri-origin.md` - canonical Yuri OS contract
4. `SOUL.md` - persona and cognitive workflow
5. Thin adapters - `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.clinerules`, `.cursorrules`, `.windsurfrules`, `.clauderules`, `.cursor/rules/sync.mdc`, `.codex/*`
6. Executable routing - `_SYSTEM/Scripts/offload-contract.mjs`
7. On-demand references and skills
8. Model inference - lowest priority

## Canonical Shape

- Shared policy lives once here or in executable contracts.
- Adapter files may narrow behavior for a surface, but they may not restate shared policy or create multi-hop inheritance chains.
- When rules conflict, owner intent and local evidence win first; then this origin; then the smallest surface-specific adapter.
- If two files duplicate the same rule, keep it in the narrowest correct home and delete the duplicate elsewhere.

## GitNexus / Local Code Intelligence

- Before editing any function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})`.
- Before committing, run `gitnexus_detect_changes()` to verify only expected symbols and execution flows changed.
- If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.
- Use `gitnexus_query({query: "concept"})` for unfamiliar code and `gitnexus_context({name: "symbolName"})` for full symbol context.
- Warn the owner before proceeding if impact analysis returns HIGH or CRITICAL risk.

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

Never read or write these paths unless the owner explicitly authorizes a specific operation:

- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.env`
- `node_modules/`
- secrets, API keys, credentials

## Evidence Contract Grammar

Deterministic evidence lines, machine-parseable:
```
TERM_COUNT term=<TERM> count=<N>
FILE_COUNT file=<PATH> count=<N>
MATCH file=<PATH> term=<TERM> line=<N> excerpt="<bounded text>"
```

- PASS requires deterministic local evidence. No PASS without TERM_COUNT / FILE_COUNT / MATCH proof.
- Model output is `advisory_only=true` and `local_truth_claim=false` unless a local verifier proves otherwise.
- Domains without TERM_COUNT support must be marked `no_evidence` and not prioritized.

## Offload Routing

- `_SYSTEM/Scripts/offload-contract.mjs` is the single lane, scenario, and lifecycle contract.
- Do not duplicate lane tables, model tables, or lifecycle matrices in adapters.
- Route protocol, IDE, and agent harness changes through `_SYSTEM/Scripts/offload-contract.mjs` first, then sync adapter files.

## Safety / Gate Routing

- Anime-DNA gates: domain expansion (`/yuri-domain`), infinity guard (`/yuri-guard`), zenkai loop (`/yuri-zenkai`), pattern mirror (`/yuri-pattern-mirror`), clone orchestrator (`/yuri-clone`).
- No silent bypass of safety gates.
- Symbiotic pulse is mandatory for every visible input: user input, assistant self-proposed action, tool result, docked LLM output, handoff, plan, and final claim. Use the lightweight pulse by default and escalate when risk, ambiguity, mutation, protected state, or model claims require it.
- Docked LLM and model output is advisory until deterministic local evidence verifies it. Owner intent can override preferences, not safety gates or protected-surface restrictions.
- HIGH or CRITICAL risk requires owner approval before proceeding.

## Professional Operating Lenses

Refer to `nudimmud_operating_dna.md` for the full lens table. Lenses are advisory viewpoint suggestions, not separate authority sources.

## Lane Result Grammar

Every Yuri OS lane must emit a machine-readable RESULT_LABEL conforming to this grammar.

```
LANE_ID    := 2-digit-prefix + 2-char-lane-code (e.g. 08CW)
LABEL      := LANE_ID + "_" + DESCRIPTION + "_" + PASS_TYPE + "_COMMITTED"
PASS_TYPE  := X (full) | P (partial) | F (failed/blocked)
DESCRIPTION := SCREAMING_SNAKE_CASE, max 60 chars
```

Example: `08CW_PDF_TEXT_EXTRACTION_POPPLER_X_PASS_COMMITTED`

Adapters must emit a conforming RESULT_LABEL in every lane result.
