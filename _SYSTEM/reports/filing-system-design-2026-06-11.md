# YURI Filing System — System Design

**Date:** 2026-06-11
**Author:** Claude (Rick C-137)
**Status:** DESIGN — awaiting owner approval before implementation
**Depends on:** `filing-system-audit-2026-06-11.md` (the audit that produced the 16-layer reference map)

---

## The Problem, Precisely

YURI has ~14,000 reference points across 16 layers. Moving a single file can break:
- Session boot (3 CRITICAL @-include refs)
- Runtime safety gates (23 CRITICAL hook refs)
- The system's self-model (347 CRITICAL circuitry-graph refs)
- Navigation (4,287 HIGH markdown path mentions + 435MB FTS5 index + 271MB GitNexus index)
- Code execution (8,498 HIGH code string-literal refs)

The existing filing assessor recommends where files should go. But:
1. It doesn't know what references a file, so it can't safely move anything.
2. It has no hook integration, so new files land wherever the model writes them.
3. It covers 8 zones — the repo needs ~24.

This design closes both gaps: reference-aware moves AND creation-time routing.

---

## Architecture: Three Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    FILING SYSTEM v1                              │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │  ASSESSOR    │   │  DEPENDENCY  │   │  MUTATOR         │   │
│  │  (exists)    │──>│  SCANNER     │──>│  (new)           │   │
│  │              │   │  (new)       │   │                  │   │
│  │  classify →  │   │  scan refs → │   │  plan → dry-run  │   │
│  │  zone        │   │  impact map  │   │  → execute       │   │
│  └──────────────┘   └──────────────┘   └──────────────────┘   │
│         │                   │                   │               │
│         v                   v                   v               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              HOOKS (creation-time routing)                │  │
│  │  PreToolUse:  advisory zone check before Write/Edit      │  │
│  │  PostToolUse: ledger entry + misplaced detection         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component 1: Assessor (exists, needs expansion)

**File:** `_SYSTEM/Scripts/filing-assessor.mjs`
**Status:** Working, 23/23 tests, 8 zone rules

**What changes:**
- Expand `ZONE_RULES` from 8 → ~24 zones (see Zone Map below)
- Add `fileType` to classify output (so the mutator knows what reference layers to scan)
- Export `ZONE_RULES` as a structured object (currently just an array of test functions)

**What stays the same:**
- READ-ONLY contract
- Protected-path veto (fail-closed)
- Staleness scoring
- Deterministic (no RNG, sorted output)

### Component 2: Dependency Scanner (new)

**File:** `_SYSTEM/Scripts/filing-deps.mjs`
**Purpose:** Given a file path, find every reference to it across all 16 layers.

**Design:**

```javascript
// Core function: scan all reference layers for a file
export function scanDeps(filePath) {
  const rel = normalizePath(filePath);
  const deps = {
    // Layer 1: code imports
    imports: grepImports(rel),
    // Layer 2: markdown cross-refs
    markdownRefs: grepMarkdownRefs(rel),
    // Layer 3: @-include chain
    atIncludes: grepAtIncludes(rel),
    // Layer 4: INDEX.md
    indexRefs: grepIndexRefs(rel),
    // Layer 5: circuitry graph
    graphRefs: grepGraphRefs(rel),
    // Layer 6-7: registries
    registryRefs: grepRegistryRefs(rel),
    // Layer 8: organ guides
    organGuideRefs: grepOrganGuideRefs(rel),
    // Layer 9: skill files
    skillRefs: grepSkillRefs(rel),
    // Layer 10: hooks + settings
    hookRefs: grepHookRefs(rel),
    // Layer 11: memory files
    memoryRefs: grepMemoryRefs(rel),
    // Layer 12-13: indexes (need reindex, not grep)
    needsReindex: { fts5: true, gitnexus: true },
    // Layer 14-16: low-risk
    htmlRefs: grepHtmlRefs(rel),
    symlinkRefs: grepSymlinkRefs(rel),
    jsonConfigRefs: grepJsonConfigRefs(rel),
  };
  deps.totalRefs = sumCounts(deps);
  deps.riskLevel = classifyRisk(deps); // CRITICAL | HIGH | MEDIUM | LOW
  return deps;
}

// For a batch move: scan deps for every file in the plan
export function scanBatchDeps(filePaths) {
  return filePaths.map(p => ({ path: p, deps: scanDeps(p) }));
}
```

**Implementation approach:**
- Layers 1-4, 6-11, 14-16: `grep` for the normalized relative path across all relevant files
- Layer 5 (circuitry graph): parse `yuri-graph.json`, search `files[]` arrays and `description` strings
- Layers 12-13 (indexes): flag for reindex, don't try to update the index directly

**Performance:** The grep operations are bounded by repo size. For a single file, this takes <1s. For a batch of 65 files, parallel grep takes <5s. The graph parse is O(nodes) = O(240) = instant.

### Component 3: Mutator (new)

**File:** `_SYSTEM/Scripts/filing-mutator.mjs`
**Purpose:** Execute the assessor's recommendations with full reference propagation.

**Design:**

```javascript
// Core function: plan a move with dependency awareness
export function planMove(filePath, targetZone) {
  const assessment = assess(filePath);
  const deps = scanDeps(filePath);
  const targetPath = computeTargetPath(filePath, targetZone);

  return {
    source: filePath,
    target: targetPath,
    zone: targetZone,
    assessment,
    deps,
    refsToUpdate: computeRefUpdates(filePath, targetPath, deps),
    risk: deps.riskLevel,
    needsReindex: deps.needsReindex,
    gitCommand: `git mv "${filePath}" "${targetPath}"`,
  };
}

// Execute a move plan (dry-run by default)
export function executeMove(plan, opts = { dryRun: true }) {
  const steps = [];

  // Step 1: git mv (preserves history)
  steps.push({ type: 'move', cmd: plan.gitCommand });

  // Step 2: update every reference layer
  for (const ref of plan.refsToUpdate) {
    steps.push({
      type: 'update-ref',
      file: ref.file,
      old: ref.oldPath,
      new: ref.newPath,
      layer: ref.layer,
    });
  }

  // Step 3: reindex (flag, don't execute inline)
  if (plan.needsReindex.fts5) {
    steps.push({ type: 'reindex', target: 'fts5' });
  }
  if (plan.needsReindex.gitnexus) {
    steps.push({ type: 'reindex', target: 'gitnexus' });
  }

  if (opts.dryRun) {
    return { dryRun: true, steps, wouldMove: plan.source, toPath: plan.target };
  }

  // Execute: git mv first, then sed/grep-and-replace for each ref
  return executeSteps(steps);
}

// Batch execute: plan all moves, then execute in dependency order
export function executeBatch(plans, opts = { dryRun: true }) {
  // Sort by risk: LOW first, CRITICAL last (so we can abort early if something breaks)
  const sorted = plans.sort((a, b) => riskWeight(a.risk) - riskWeight(b.risk));
  const results = [];
  for (const plan of sorted) {
    const result = executeMove(plan, opts);
    results.push(result);
    if (!opts.dryRun && result.error) {
      return { results, aborted: true, failedAt: plan.source, error: result.error };
    }
  }
  return { results, aborted: false };
}
```

**Reference update strategy per layer:**

| Layer | Update method | Atomic? |
|-------|--------------|---------|
| 1. Code imports | `sed -i 's\|old/path\|new/path\|g'` on the 3 files | Yes |
| 2. Markdown refs | `sed -i` on each referencing file (4,287 lines, but per-file not per-line) | Yes |
| 3. @-includes | Manual update of CLAUDE.md (3 refs, CRITICAL) | Yes |
| 4. INDEX.md | `sed -i` on INDEX.md (66 refs) | Yes |
| 5. Circuitry graph | Parse JSON, update `files[]` arrays, write back | Yes |
| 6-7. Registries | Update `matchPrefix` if zone changes | Yes |
| 8. Organ guides | Update `source_file` fields, re-run projector | Yes |
| 9. Skills | Update path refs in SKILL.md files | Yes |
| 10. Hooks | `sed -i` on hook files (23 refs) | Yes |
| 11. Memory | `sed -i` on memory files (40 refs) | Yes |
| 12-13. Indexes | Flag for reindex (run `ai reindex` + `npx gitnexus analyze`) | Async |
| 14-16. Low-risk | `sed -i` where needed | Yes |

**Rollback:** Every move is a `git mv` + `sed`. Rollback = `git checkout HEAD~1 -- <files>`. The mutator records the git commit hash before execution so rollback is deterministic.

---

## Zone Map (expanded from 8 → 24)

| Zone ID | Path | File types | Notes |
|---------|------|-----------|-------|
| `EPHEMERAL` | `/tmp/` or `.tmp/` | `.bak`, `.tmp`, `.scratch`, `.swp` | Purge candidate |
| `CONFIG_SCHEMAS` | `_SYSTEM/config/schemas/` | `.schema.json` | JSON schemas |
| `CONFIG_REGISTRIES` | `_SYSTEM/config/` | `.json` (non-schema) | Registry JSONs |
| `DOCS_ROOT` | `_SYSTEM/docs/` | `.md` (architecture, protocol) | Root-level system docs |
| `DOCS_HANDOFFS` | `_SYSTEM/docs/handoffs/` | `.md` (HANDOFF-*) | Session handoffs |
| `DOCS_TOKEN` | `_SYSTEM/docs/token/` | `.md` (token-*) | Token management |
| `DOCS_COGNITION` | `_SYSTEM/docs/cognition/` | `.md` (neural-*, YURI-COGNITION) | Cognition/identity |
| `RESEARCH` | `02_RESOURCES/RESEARCH/` | `.md` (research, spec, synthesis) | Research vault |
| `RESEARCH_DATA` | `02_RESOURCES/RESEARCH/_data/` | `.json` (graph data, reports) | Research data files |
| `KNOWLEDGE` | `02_RESOURCES/KNOWLEDGE-BASE/` | `.md` (organized knowledge) | Knowledge base |
| `REPORTS` | `_SYSTEM/reports/` | `.md` (reports, audits) | Generated reports |
| `REPORTS_HTML` | `_SYSTEM/reports/html/` | `.html` | HTML dashboards |
| `REPORTS_WAVES` | `_SYSTEM/reports/waves/` | `.md` (wave-*, WAVE-*) | Wave fix reports |
| `REPORTS_PAPERS` | `_SYSTEM/reports/papers/` | `.md` (paper drafts) | Paper sections |
| `MATH_MODULES` | `_SYSTEM/Scripts/math/` | `.mjs`, `.js` (math-*) | Math scripts |
| `SCRIPTS` | `_SYSTEM/Scripts/` | `.mjs`, `.js`, `.cjs`, `.sh` | Runtime scripts |
| `SCRIPTS_BIN` | `_SYSTEM/bin/` | `.sh`, `.zsh` | Shell launchers |
| `STATE` | `_SYSTEM/state/` | `.jsonl`, `.json` (state) | Runtime state |
| `BRAND` | `_SYSTEM/BRAND/` | `.md` (design, persona) | Brand/identity |
| `LEARNING` | `_SYSTEM/learning/` | `.md` (learning, training) | Learning docs |
| `SPECS` | `_SYSTEM/specs/` | `.md` (spec-*) | Active specs |
| `SESSION_OUTPUTS` | `_SYSTEM/session-outputs/` | `.md` (session outputs) | Lane outputs |
| `ARCHIVE` | `_SYSTEM/archive/` | any (retired) | Retired material |
| `MEMORY` | `_SYSTEM/memory/` | `.md` (memory) | YURI canonical memory |

**Classification priority:** First-match wins (same as current assessor). The order above IS the priority — `EPHEMERAL` beats everything, `CONFIG_SCHEMAS` beats `CONFIG_REGISTRIES`, etc.

---

## Hook Integration: Creation-Time Routing

### PreToolUse Hook (advisory, before Write/Edit)

**File:** `.claude/hooks/filing-gate.mjs`
**Matcher:** `Write|Edit` (same as `math-register-guard.mjs`)
**Behavior:** Advisory only — never blocks.

```javascript
// Pseudocode for the hook
export default function filingGate(toolInput) {
  const filePath = toolInput.file_path;
  if (!filePath) return; // not a file operation

  const zone = classifyArtifact(filePath);
  if (zone.zone === null) return; // unclassified, no opinion

  // Check if the file is going to the right zone
  const currentDir = path.dirname(filePath);
  if (zone.zone !== currentDir && !currentDir.startsWith(zone.zone + '/')) {
    // Advisory: suggest the canonical zone
    return {
      decision: 'allow', // never block, just advise
      reason: `FILING ADVISORY: ${filePath} canonically belongs in ${zone.zone} (${zone.kind}). Consider writing to ${zone.zone}/${path.basename(filePath)} instead.`,
    };
  }
  return; // file is in the right zone, no advisory
}
```

**Why advisory, not blocking:** The model sometimes needs to write files to temporary locations during multi-step operations. Blocking would break workflow. The advisory lets the model self-correct or proceed with awareness.

### PostToolUse Hook (ledger, after Write/Edit)

**File:** `.claude/hooks/filing-ledger.mjs`
**Matcher:** `Write|Edit|Bash|MultiEdit`
**Behavior:** Logs every file write to a filing ledger for post-session audit.

```javascript
// Pseudocode for the hook
export default function filingLedger(toolInput, toolOutput) {
  const filePath = toolInput.file_path;
  if (!filePath) return;

  const assessment = assess(filePath);
  const ledgerEntry = {
    timestamp: Date.now(),
    path: normalizePath(filePath),
    kind: assessment.kind,
    zone: assessment.recommendedZone,
    misplaced: assessment.misplaced,
    session: process.env.CLAUDE_SESSION_ID || 'unknown',
  };

  // Append to filing ledger (JSONL, append-only)
  fs.appendFileSync(
    path.join(REPO, '_SYSTEM/state/filing-ledger.jsonl'),
    JSON.stringify(ledgerEntry) + '\n'
  );

  // If misplaced, emit advisory context for the model
  if (assessment.misplaced) {
    return {
      decision: 'allow',
      reason: `FILING: ${filePath} is in ${assessment.currentZone} but belongs in ${assessment.recommendedZone}. Logged for post-session cleanup.`,
    };
  }
}
```

**The ledger** (`_SYSTEM/state/filing-ledger.jsonl`) becomes the source of truth for "what landed where this session." At session end, the filing sweep reads the ledger and produces a relocation plan.

---

## The Recommendation-to-Execution Gap

The gap exists because:
1. The assessor is READ-ONLY by design (correct — it shouldn't auto-move)
2. No component translates recommendations into moves
3. No component tracks what references need updating
4. No component executes the moves with rollback safety

**How this design closes it:**

```
                    RECOMMENDATION          DEPENDENCY SCAN         EXECUTION
                    ──────────────          ───────────────         ─────────
New file lands  ──> Assessor classifies ──> Deps scanner finds ──> Mutator plans
in wrong zone       zone + staleness        all 16 ref layers       move + ref updates

Existing file   ──> Batch assess all    ──> Batch scan deps     ──> Mutator executes
in wrong zone       repo files              for misplaced files     dry-run → owner review → execute

Session end     ──> Read filing ledger  ──> Scan deps for       ──> Produce relocation
                    (what landed wrong)     ledger entries          plan for next session
```

**The execution flow for a single file move:**

1. `assess(filePath)` → returns `{ recommendedZone, misplaced, kind }`
2. `scanDeps(filePath)` → returns `{ imports, markdownRefs, graphRefs, hookRefs, ... totalRefs, riskLevel }`
3. `planMove(filePath, targetZone)` → returns `{ source, target, refsToUpdate, gitCommand, risk }`
4. `executeMove(plan, { dryRun: true })` → returns what WOULD happen
5. Owner reviews dry-run output
6. `executeMove(plan, { dryRun: false })` → executes git mv + sed for all refs
7. Flag FTS5 + GitNexus for reindex
8. Verify: re-run `scanDeps(newPath)` to confirm zero stale refs

**The execution flow for the batch sweep (65+ files):**

1. `assessAll(repoFiles)` → returns all misplaced files
2. `scanBatchDeps(misplacedFiles)` → returns deps for each
3. `executeBatch(plans, { dryRun: true })` → full dry-run report
4. Owner reviews, approves/rejects individual moves
5. `executeBatch(approvedPlans, { dryRun: false })` → executes approved moves
6. Reindex FTS5 + GitNexus
7. Verify: re-run assessor, confirm zero misplaced

---

## Risk Mitigation

### CRITICAL moves (hooks, @-includes, circuitry graph)

These files CANNOT be moved without breaking the system. Strategy:
- **@-includes** (yuri-origin.md, persona.md, SOUL.md): DO NOT MOVE. These are canonical anchors.
- **Hook bindings**: Update hook files FIRST, then move the target script. Test hooks after each move.
- **Circuitry graph**: Update graph JSON, run `yuri-graph-unify.mjs project` to regenerate projections.

### HIGH-risk moves (markdown prose, indexes)

- **Markdown refs**: `sed -i` is safe for simple path replacement. Test with `grep -c old/path` before and after to confirm zero remaining refs.
- **FTS5 index**: Run `ai reindex` after all moves complete.
- **GitNexus index**: Run `npx gitnexus analyze` after all moves complete.

### Rollback

Every batch execution is a single git commit. Rollback = `git revert HEAD` or `git checkout HEAD~1 -- <files>`. The mutator records the commit hash before execution.

### Protected paths

The assessor already has fail-closed veto. The mutator inherits this. NEVER move:
- `.env`
- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `node_modules/`

---

## Build Order

### Phase 1: Expand the Assessor (1-2 hours)
- Add 16 new zone rules to `ZONE_RULES`
- Expand test suite to cover all new zones
- Add `fileType` to classify output
- Test: `node filing-assessor.mjs --json <all-repo-files>` produces correct zones

### Phase 2: Build the Dependency Scanner (2-3 hours)
- Create `filing-deps.mjs`
- Implement grep-based ref scanning for layers 1-4, 6-11, 14-16
- Implement JSON parse for layer 5 (circuitry graph)
- Test: `scanDeps('_SYSTEM/Scripts/llm-compat-contract.mjs')` returns correct ref counts

### Phase 3: Build the Mutator (2-3 hours)
- Create `filing-mutator.mjs`
- Implement `planMove`, `executeMove`, `executeBatch`
- Implement ref-update logic per layer
- Implement rollback
- Test: dry-run on a single file, verify ref updates are correct

### Phase 4: Hook Integration (1-2 hours)
- Create `.claude/hooks/filing-gate.mjs` (PreToolUse advisory)
- Create `.claude/hooks/filing-ledger.mjs` (PostToolUse ledger)
- Register hooks in `settings.json`
- Test: write a file to the wrong zone, verify advisory fires

### Phase 5: Batch Sweep (2-4 hours, owner-reviewed)
- Run full repo assessment
- Run batch dependency scan on misplaced files
- Produce dry-run report
- Owner reviews
- Execute approved moves
- Reindex FTS5 + GitNexus
- Verify zero stale refs

### Phase 6: Cleanup (1-2 hours)
- Delete 28 empty directories
- Delete 1,057 empty session-env UUID dirs
- Resolve knowledge-base duplication
- Archive stale handoffs and one-off files

---

## Files to Create/Modify

| File | Action | Phase |
|------|--------|-------|
| `_SYSTEM/Scripts/filing-assessor.mjs` | Modify: expand ZONE_RULES | 1 |
| `_SYSTEM/Scripts/filing-assessor.test.mjs` | Modify: expand tests | 1 |
| `_SYSTEM/Scripts/filing-deps.mjs` | **CREATE** | 2 |
| `_SYSTEM/Scripts/filing-deps.test.mjs` | **CREATE** | 2 |
| `_SYSTEM/Scripts/filing-mutator.mjs` | **CREATE** | 3 |
| `_SYSTEM/Scripts/filing-mutator.test.mjs` | **CREATE** | 3 |
| `.claude/hooks/filing-gate.mjs` | **CREATE** | 4 |
| `.claude/hooks/filing-ledger.mjs` | **CREATE** | 4 |
| `.claude/settings.json` | Modify: register hooks | 4 |
| `_SYSTEM/config/folder-registry.json` | Modify: add new zones | 1 |
| `_SYSTEM/config/artifact-registry.json` | Modify: add new placement rules | 1 |
| `_SYSTEM/yuri-graph.json` | Modify: update file refs | 5 |
| `_SYSTEM/INDEX.md` | Modify: update path refs | 5 |
| `CLAUDE.md` | Verify (DO NOT MODIFY @-includes) | 5 |
| `_SYSTEM/state/filing-ledger.jsonl` | **CREATE** (runtime output) | 4 |

---

## Acceptance Criteria

1. Every artifact type in the repo has a zone rule (24 zones)
2. `filing-deps.mjs` correctly identifies refs across all 16 layers for any file
3. `filing-mutator.mjs` can plan a move with full ref-update list
4. `filing-mutator.mjs` can execute a dry-run and produce a human-readable report
5. `filing-mutator.mjs` can execute actual moves with `git mv` + ref propagation
6. Protected paths are never moved (fail-closed veto inherited from assessor)
7. The 65+ loose `_SYSTEM/` root files are relocated to canonical zones
8. All 16 reference layers are updated for every moved file
9. FTS5 and GitNexus indexes are reindexed after all moves
10. Zero stale path references remain after the sweep (verified by grep)
11. The PreToolUse advisory hook fires when a new file lands in the wrong zone
12. The PostToolUse ledger captures every file write with zone classification
13. Rollback is possible via `git revert` for any batch execution

---

## Residual Risk

- **Lane writes bypass hooks.** Codex/DeepSeek dispatched agents write files outside Claude's tool harness. The filing system can only catch Claude-authored writes. Lane outputs land in `_SYSTEM/lane-output/` by convention, not enforcement. This is a known gap — fixing it requires lane-level integration (future work).
- **Markdown prose refs are noisy.** 4,287 bare path mentions include comments, explanations, and historical references. Not all of them are "live" links. The sed-based update is safe (it replaces exact strings) but may update references that were never functional links. This is acceptable — a stale mention pointing to the right path is better than a stale mention pointing to the wrong path.
- **Reindex latency.** FTS5 reindex (`ai reindex`) and GitNexus reindex (`npx gitnexus analyze`) take time. During reindex, xref queries and structural navigation return stale results. The mutator should batch all moves first, then reindex once, to minimize the stale window.
- **Large batch risk.** 65+ files in one sweep is a lot. Recommend phased execution: LOW-risk files first (reports, handoffs, stale docs), then MEDIUM-risk (registries, configs), then HIGH-risk (hooks, graph). Owner reviews between each phase.

---

*Design by Claude (Rick C-137), 2026-06-11. All reference counts from live reads. No model inference used for path verification.*
