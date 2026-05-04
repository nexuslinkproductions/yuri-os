# System Memory Authority Map

## Access Tiers

Every memory surface has an access tier. Context access (read) is separate from mutation (edit). Cline should eventually have context access to all non-secret surfaces through approved readers. Edit access always requires explicit sprint scope and local validation.

| Tier | Surfaces | Access Rule |
|---|---|---|
| PUBLIC_CONTEXT | `.clinerules`, `.cline/rules/`, `.claude/rules/`, `SystemConfig`, `.claude/skills/` | Unrestricted read by exact path. Safe reference material. |
| DURABLE_CONTEXT | Obsidian vault (repo root), vault-authored knowledge | Read-only by exact scoped path in approved tasks. No broad reads. No ingestion. |
| GENERATED_CONTEXT | Workhorse artifacts (`~/.nudimmud/workhorse-runs/`), run reports, indexes | Read-only, provenance-tagged. Planning/run evidence, not durable knowledge unless indexed by approved script. |
| HISTORICAL_CONTEXT | `_SYSTEM/yuri-history-archive/` | Readable as historical-only. Must not be promoted into current truth, RAG, boot, or session config without a separate validation gate. |
| SENSITIVE_CONTEXT | `backend/data/` (RAG DB), `.claude/state/`, `.claude/history/`, `.claude/projects/` | No raw broad reads. Only explicit scoped/redacted/approved tooling. Future sensitive readers must summarize, redact, and cap output. |
| SECRET_CONTEXT | `.env`, `.npmrc`, API keys, credentials, `node_modules/` | No raw dump. Only presence/shape checks if explicitly approved per task. |

## Authority Hierarchy

Local evidence > owner intent > .clinerules/.cline rules > .claude/rules > SystemConfig > Obsidian vault (DURABLE_CONTEXT) > workhorse artifacts (GENERATED_CONTEXT) > .claude/skills reference > archive (HISTORICAL_CONTEXT) > model inference

## Memory Surfaces

| Surface | Path | Tier | Role | Policy |
|---|---|---|---|---|
| Local evidence | git/tool/filesystem | PUBLIC_CONTEXT | Current truth | Read before claiming |
| Owner intent | session instructions | PUBLIC_CONTEXT | Direction | Highest priority |
| `.clinerules` + `.cline/rules/` | `.clinerules`, `.cline/rules/` | PUBLIC_CONTEXT | Operating rules | Behavioral authority + reference |
| `.claude/rules/` | `.claude/rules/*.md` | PUBLIC_CONTEXT | Codified contracts | Exact-path read only |
| SystemConfig | `backend/src/config/SystemConfig.ts` | PUBLIC_CONTEXT | Path registry | Read-only, exact-path |
| `.claude/skills/` | `.claude/skills/*/SKILL.md` | PUBLIC_CONTEXT | Claude-native behavior | Reference only; Cline cannot execute |
| Obsidian vault | repo root | DURABLE_CONTEXT | Human-authored knowledge | Read-only by exact scoped path in approved tasks |
| Workhorse artifacts | `~/.nudimmud/workhorse-runs/` | GENERATED_CONTEXT | Planning/run evidence | Read-only, provenance-tagged, not durable until indexed |
| History archive | `_SYSTEM/yuri-history-archive/` | HISTORICAL_CONTEXT | Historical | Readable as historical-only, never promoted without validation |
| RAG DB | `backend/data/` | SENSITIVE_CONTEXT | Structured retrieval | No raw broad reads; scoped/redacted/approved tooling only |
| Runtime state | `.claude/state/` | SENSITIVE_CONTEXT | Session state | No raw broad reads; scoped/redacted/approved tooling only |
| Session history | `.claude/history/` | SENSITIVE_CONTEXT | Session log | No raw broad reads; scoped/redacted/approved tooling only |
| Project config | `.claude/projects/` | SENSITIVE_CONTEXT | Project scope | No raw broad reads; scoped/redacted/approved tooling only |
| Secrets | `.env`, `.npmrc`, API keys | SECRET_CONTEXT | Credentials | No raw dump; presence/shape checks only if explicitly approved |
| Dependencies | `node_modules/` | SECRET_CONTEXT | Packages | No raw dump; presence/shape checks only if explicitly approved |
| Model inference | DeepSeek/Claude output | — | Lowest | Never outranks local evidence |

## Context Access vs Edit Access

- **Context access** (read): Cline should eventually have context access to all non-secret surfaces through approved readers. Each tier defines how that access works.
- **Edit access** (write/mutate): Always requires explicit sprint scope, local validation of current state, and user approval. No surface is auto-editable.
- **Promotion** (archive → current truth): Requires a separate validation gate. Historical context must not silently become durable context.

## Tier Rules

### PUBLIC_CONTEXT
Safe rules, docs, and reference files. Cline reads these by exact path as needed. No caps or redaction needed.

### DURABLE_CONTEXT (vault)
The vault is at the repo root. Cline may read vault files by exact scoped path only in explicitly approved read-only tasks. No broad reads, no writes, no ingestion, no indexing. X1 is passive awareness only. X3 adds a dedicated read-only vault bridge.

### GENERATED_CONTEXT (workhorse)
Workhorse artifacts (`~/.nudimmud/workhorse-runs/`) are planning and run evidence. Read-only and provenance-tagged by default. Not durable memory unless later indexed by an approved script. Cline may reference artifact paths from closeout reports but must not ingest artifact content as memory. X4 adds a workhorse artifact index.

### HISTORICAL_CONTEXT (archive)
`_SYSTEM/yuri-history-archive/` is historical-only. It contains GPT session exports. All files are explicitly labeled "not current truth." Cline may read archive files for historical reference but must not promote archive facts into current truth, RAG, boot, session config, or durable memory without a separate validation gate.

### SENSITIVE_CONTEXT (DB, runtime state, session history)
`backend/data/`, `.claude/state/`, `.claude/history/`, `.claude/projects/` — no raw broad reads. Only explicit scoped/redacted/approved tooling. Future sensitive readers must summarize, redact, and cap output. Never dumped into context in raw form.

### SECRET_CONTEXT (credentials, env)
`.env`, `.npmrc`, API keys, `node_modules/` — no raw dump. Only presence/shape checks if explicitly approved per task. No token values, no full file contents, no key material in context.

## Cline Role

Cline uses `.clinerules` and `.cline/rules/` as operating and reference memory (PUBLIC_CONTEXT). These are human-authored, version-controlled `.md` files — not self-updating memory. Cline does not write to its own rules or maintain runtime state. All session context is provided by the user or read from the repo by exact scoped path. Edit access requires explicit sprint scope and local validation.

## Future X-Sprint Roadmap

- X2: `Scripts/yuri-memory-map.mjs` — read-only inventory of all surfaces without reading sensitive contents. Detect which surfaces are reachable, their tier, and discovery path.
- X3: read-only vault bridge script (`yuri-vault-bridge.mjs`) — list/read vault files by exact path.
- X4: workhorse artifact index — index planning artifacts for retrieval (GENERATED_CONTEXT).
- X5: RAG source registry / ingestion gate — controlled pipeline for vault to RAG (SENSITIVE_CONTEXT tooling).
- Later: sensitive context readers that summarize, redact, and cap output by default.
