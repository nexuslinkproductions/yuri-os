# System Memory Authority Map

## Memory Surfaces

| Surface | Path | Role | Authority | Cline Policy |
|---|---|---|---|---|
| Local evidence | git/tool/filesystem | Current truth | HIGHEST | Read before claiming |
| Owner intent | session instructions | Direction | HIGH | Highest priority |
| `.clinerules` + `.cline/rules/` | `.clinerules`, `.cline/rules/` | Operating rules | HIGH | Behavioral authority + reference |
| `.claude/rules/` | `.claude/rules/*.md` | Codified contracts | HIGH | Exact-path read only |
| SystemConfig | `backend/src/config/SystemConfig.ts` | Path registry | HIGH | Read-only, exact-path |
| Obsidian vault | repo root (`.obsidian/`, K-Base etc.) | Human-authored knowledge | MEDIUM | Passive awareness only (X1) |
| Workhorse artifacts | `~/.nudimmud/workhorse-runs/` | Planning/run evidence | MEDIUM | Reference only, not durable memory |
| `.claude/skills/` | `.claude/skills/*/SKILL.md` | Claude-native behavior | LOW | Reference only; Cline cannot execute |
| History archive | `_SYSTEM/yuri-history-archive/` | Historical | LOW | Must not promote to memory |
| Model inference | DeepSeek/Claude output | Lowest | LOWEST | Never outranks local evidence |

## Authority Hierarchy

Local evidence > owner intent > .clinerules/.cline rules > .claude/rules > SystemConfig > Obsidian vault > workhorse artifacts > .claude/skills reference > archive historical-only > model inference

## Sensitive / Off-Limits Areas

Cline must never read, write, or reference:
- `backend/data/` — RAG database
- `.claude/state/` — runtime state (evidence ledger, session state)
- `.claude/history/` — session history
- `.claude/projects/` — project config
- `.env`, `.npmrc` — secrets and local config
- `node_modules/` — dependencies
- Any secrets, API keys, credentials

## Archive Rule

`_SYSTEM/yuri-history-archive/` is historical-only. It contains GPT session exports. All files are explicitly labeled "not current truth." Cline must not promote archive facts into memory, RAG, boot, session config, or current truth without a separate validation gate.

## Vault Rule

The vault is at the repo root. Cline may read vault files by exact scoped path only in explicitly approved read-only tasks. No broad reads, no writes, no ingestion, no indexing. Passive awareness only.

## Workhorse Rule

Workhorse artifacts (`~/.nudimmud/workhorse-runs/`) are planning and run evidence. They are not durable memory unless later indexed by an approved script. Cline may reference artifact paths from closeout reports but must not ingest artifact content as memory.

## Cline Role

Cline uses `.clinerules` and `.cline/rules/` as operating and reference memory. These are human-authored, version-controlled `.md` files — not self-updating memory. Cline does not write to its own rules or maintain runtime state. All session context is provided by the user or read from the repo by exact scoped path.

## Future X-Sprint Roadmap

- X2: read-only memory map script (`yuri-memory-map.mjs`) — deterministic inventory of reachable surfaces
- X3: read-only vault bridge script (`yuri-vault-bridge.mjs`) — list/read vault files by exact path
- X4: workhorse artifact index — index planning artifacts for retrieval
- X5: RAG source registry / ingestion gate — controlled pipeline for vault to RAG
