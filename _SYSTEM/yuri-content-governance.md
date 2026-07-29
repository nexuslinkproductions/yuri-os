# Yuri OS Content Governance

Enterprise-ready content classification and governance policy for all Markdown and text surfaces in the YURI repository.

## Canonical Authority

`_SYSTEM/yuri-origin.md` is the sole canonical origin for Yuri OS operating doctrine. All other surfaces are subordinate, derivative, or reference-only.

## Classification Categories

### KEEP_TRACKED_CONTROL
True Yuri OS control surfaces. Tracked, reviewed, origin-aware. Includes `_SYSTEM/yuri-origin.md`, `SOUL.md`, executable routing in `_SYSTEM/Scripts/llm-compat-contract.mjs`, thin tool adapters (`AGENTS.md`, `CLAUDE.md`, `.clinerules`, `.cursorrules`, `.windsurfrules`, `.clauderules`, `.cursor/rules/sync.mdc`, `.codex/*`), operating references (`.claude/rules/*.md`, `.cline/rules/*.md`), and reference data (`_SYSTEM/model-registry.md`). These are the canonical set for context, evidence, and review.

### KEEP_REFERENCE_CURATED
Curated historical or reference content. Not current doctrine but preserved for audit. Includes `_SYSTEM/yuri-history-archive/` (session exports) and curated vault Markdown. Reference-only unless promoted by evidence contract.

### QUARANTINE_EXTERNAL_CORPUS
External corpora not authored by Yuri OS. Not authority by default. Not eligible for RAG ingestion without provenance, license/IP review, and explicit owner approval. Includes `RESEARCH/ORACLE-CORPUS/` (cloned openclaw skills), `01_PROJECTS/claude-cookbooks/` (Anthropic samples), `01_PROJECTS/claude-mem/` (external plugin), gstack mirror skill dirs.

### GITIGNORE_GENERATED_CACHE
Auto-generated or cached content. Never authority. Includes `.claude/file-history/`, `.claude/paste-cache/`, `.claude/cache/`, `.claude/eot/`, `.claude/projects/`, `.claude/plugins/marketplaces/`. Ignored from repo scans and searches by default. Note: some paths have tracked files that predate governance — `.gitignore` prevents future untracked noise but does not hide pre-existing tracked files.

### ARCHIVE_COMPRESS_OR_MOVE
Historical content that could be consolidated. Includes `00_COMMAND-CENTER/SESSION-REPORTS/` and old daily notes. Not urgent; owner approval required before moving.

### DELETE_CANDIDATE_REQUIRES_USER_APPROVAL
No files are approved for deletion in this sprint. Any future deletion requires explicit owner approval per-item.

### NEEDS_REVIEW
Content that may need reclassification. Includes archive duplicates under `07_ARCHIVE/`, `esoteric_codex.md` archive divergence, and `.claude/plugins/marketplaces/` tracked files that may need separate handling.

## Governance Rules

- External corpora are never authority by default.
- Generated caches are never authority.
- Historical archives are reference-only unless promoted by evidence contract.
- RAG ingestion must be allowlist-based. Only explicitly approved surfaces may be ingested.
- Enterprise ingestion requires: provenance, license/IP review, source ownership, retention category, evidence tier.
- Model output remains `advisory_only=true` and `local_truth_claim=false` unless locally verified.
- No broad cleanup or deletion without explicit owner approval.
- `.gitignore` entries prevent future untracked noise. Pre-existing tracked files are not hidden by `.gitignore` and require separate handling if cleanup is desired.
