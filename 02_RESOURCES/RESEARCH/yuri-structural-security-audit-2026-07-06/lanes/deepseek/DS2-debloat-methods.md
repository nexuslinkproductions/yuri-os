Now I have a thorough picture of YURI's own cleanup methodology and the broader problem space. Let me produce the survey.

---

# SURVEY: Large-Codebase De-Bloat — Methods, Risks, and a Safe-Cut Protocol

**Research lane:** YURI nano-swarm node (deepseek-v4-flash:cloud)  
**Target:** ~600 scripts, 44 hooks, 100+ skills, 300+ memory files  
**Feeds:** Fable-5 mastermind cut planning

---

## 1. DEAD-CODE / ORPHAN DETECTION — Four Layers

### Layer 1: Static Import Graph (the foundation)

**HARD-FACT.** Every module system (ESM `import`, CJS `require`, TypeScript `import`/`import type`) produces a directed graph. Walk it from all known entry points (CLI bins, hook registrations, `package.json` `"main"`, `"exports"`, `"bin"`, test files, CI configs). Any module not reachable from any entry is **import-dead**.

**YURI-specific tools already in place:**
- `xref-query.mjs` — FTS5 + circuitry graph + GitNexus + spectrum. Run `node _SYSTEM/Scripts/xref-query.mjs "<module-name>" --top 200` to find all importers.
- `propagation-scan.mjs` — dry-run circuitry sibling checks. `node _SYSTEM/Scripts/propagation-scan.mjs <node-id> --dry-run` finds structural siblings.
- `yuri-navigate.mjs` — closed-form DEPENDENCY (outgoing closure) + IMPACT (incoming closure). `node _SYSTEM/Scripts/yuri-navigate.mjs --dependency <path>` finds everything a module depends on; `--impact <path>` finds everything that depends on it.

**RECALLED-PATTERN (industry):** For languages without static analysis, `madge` (JS), `dependency-cruiser` (JS/TS), `pylint --disable=all --enable=R` (Python), `go tool vet` (Go), `cargo udeps` (Rust). For JS specifically: `npx madge --circular --extensions js,mjs,ts .` produces a full graph; `npx depcruise --init` then `npx depcruise --ts-config tsconfig.json --output-type dot src | dot -T svg > graph.svg`.

**CAVEAT:** Dynamic imports (`import()`), `require.resolve()`, plugin systems, and `eval()`-based routing are invisible to static analysis. These must be supplemented by Layer 2.

### Layer 2: Call-Graph Reachability (finer granularity)

**HARD-FACT.** A file may be imported but only 2 of its 15 exports are ever called. The rest are dead exports. Static import graph catches file-level orphans; call-graph catches export-level orphans.

**YURI tools:** `gitnexus_impact({target: "symbolName", direction: "upstream"})` — finds callers of a specific symbol. `gitnexus_detect_changes()` — git-diff based impact analysis.

**RECALLED-PATTERN (industry):** TypeScript compiler's `--noUnusedLocals` and `--noUnusedParameters` catch intra-file dead code. `ts-prune` finds unused exports. `eslint-plugin-unused-imports` catches import-level. For Python: `vulture`, `autoflake --remove-all-unused-imports`. For dynamic languages: coverage-guided dead code detection (run full test suite with coverage, then check which functions/lines were never hit).

**CAVEAT:** A function may be "dead" in the sense that no code path calls it, but it may be a **public API** (exported for external consumers), a **reflection target** (loaded by name via `new Function()` or `eval()`), or a **test helper** (imported only by test files). These are not safe to delete.

### Layer 3: Dynamic-Usage Logs (the safety net)

**HARD-FACT.** Static analysis cannot see:
- Plugin systems that load modules by convention (e.g., `require('./plugins/' + name)`)
- Configuration-driven routing (e.g., `settings.json` hook registrations)
- Runtime code generation (`eval()`, `new Function()`, `vm.runInThisContext()`)
- Dynamic dispatch through maps/dicts (`const handlers = {foo: fooHandler}`)
- Template/string-based path construction

**RECALLED-PATTERN (industry):** Production dead-code detection tools (e.g., Google's `gryffin`, Uber's `piranha`) use a combination of:
1. **Code coverage from production traffic** — functions never hit in N days are candidates
2. **Feature-flag-aware analysis** — code behind a permanently-enabled flag is not dead; code behind a permanently-disabled flag is
3. **Log-based call detection** — instrument function entry points and check which are actually invoked over a window

**For YURI specifically:** The `.claude/settings.json` hook registrations, `.claude/commands/*.md` command definitions, and `_SYSTEM/config/artifact-registry.json` are the **configuration-driven routing layer**. A script that is not registered in any of these AND not imported by any registered script is dead. But a script that IS registered but has never been called in 90 days is a different category — see §3.

### Layer 4: Git History / Temporal Analysis

**RECALLED-PATTERN (industry):** Files that haven't changed in 2+ years and have no open issues/PRs referencing them are strong deletion candidates. But this is a **weak signal alone** — stable infrastructure code may be untouched precisely because it works perfectly.

**For YURI:** The wave-3 cleanup already found 5 confirmed-dead commands (ds-flash, ds-pro, ds-ultra, ds-vision, ds-code) — these were retired model lanes whose commands were never removed. Git history + lane roster cross-check catches these.

---

## 2. SAFE-DELETION WORKFLOW — Staged Removal

### The Three-Gate Protocol

**HARD-FACT (from YURI's own wave-3 methodology).** The most expensive mistake is deleting something live. The second most expensive is keeping something dead forever. The protocol:

**Gate 1 — DEPRECATION MARKER (soft delete, 0 risk)**
- Add a comment/header: `// DEPRECATED 2026-07-XX — see [reason]. Remove after [date/event].`
- Do NOT change any import or call site.
- Do NOT remove the file.
- Add to a deprecation registry (`_SYSTEM/config/deprecation-registry.json` or similar).
- **Risk: zero.** Nothing breaks. The marker is documentation.

**Gate 2 — STAGED REMOVAL (remove imports, keep file)**
- Remove all import/require statements from live code.
- Remove all hook registrations from `settings.json`, command registrations from `.claude/commands/`, etc.
- The file still exists on disk but nothing loads it.
- Run full test suite + health gate.
- **Risk: low.** If something breaks, re-adding the import is a one-line revert. The file is still there.

**Gate 3 — HARD DELETE (remove file)**
- Only after Gate 2 has passed AND the system has run for N sessions (N ≥ 3 recommended) without any error referencing the file.
- `git rm <file>` (or `rm` + `git add`).
- Update any registry that referenced the path.
- **Risk: medium.** Recoverable via `git revert` but requires a commit.

### Revertability Contract

**HARD-FACT.** Every deletion must be revertable with a single `git revert <sha>` or `git checkout HEAD~1 -- <path>`. This means:
- One commit per deletion (or per small batch of related deletions)
- No mixing deletions with other changes in the same commit
- Commit message must name every deleted path: `chore: remove dead organ eot-background-start.js (wave-3 WP-H.1)`

### YURI's Own Revertability Pattern (from wave handovers)

**HARD-FACT (from YURI corpus).** The wave-3 handovers specify: "No commit, no push. Marcel holds commit authority." The worker produces the diff; the owner commits. This is the correct pattern for a Fable-5 mastermind cut — the research lane identifies, the mastermind plans, the owner authorizes.

---

## 3. DISTINGUISHING "UNUSED" FROM "LOAD-BEARING BUT RARELY CALLED"

This is the hardest judgment call. Here is the decision tree:

### Category A: TRUE DEAD (safe to delete)
- **No importers** (static import graph shows zero reachable paths)
- **No hook/command registration** (not in `settings.json`, `.claude/commands/`, artifact registry)
- **No git history of changes in 6+ months** (stable dead, not stable infrastructure)
- **No test coverage** (not imported by any test file)
- **No documentation reference** (not mentioned in any README, SKILL.md, or wiki)
- **Example from YURI:** `eot-background-start.js` — registered in SessionStart, wrote a never-read marker, injected a false claim. Real EOT lived elsewhere. **Dead organ.**

### Category B: LOAD-BEARING BUT RARELY CALLED (do NOT delete)
- **Has importers** (even if only 1)
- **Is a hook** (hooks fire on every event — they are load-bearing by definition)
- **Is a CLI entry point** (even if rarely used manually, it's a contract)
- **Is a public API** (exported for external consumers or plugin authors)
- **Is a recovery/fallback path** (only called when primary fails — rare by design)
- **Is a test helper** (only imported by test files — test files are not "live" but deleting breaks the test suite)
- **Is referenced in documentation** (someone will look for it)
- **Example from YURI:** `yuri-closeout.mjs` — only called at EOT, which is rare per session. But it's load-bearing: if it's missing when EOT fires, continuity breaks.

### Category C: AMBIGUOUS (flag for owner decision)
- **Has importers but all are themselves dead** (transitive dead)
- **Has no importers but is a known convention-based plugin** (loaded by path pattern, not by import)
- **Has no importers but is referenced in a config file** (may be loaded dynamically)
- **Has no importers but is a skill** (skills are loaded by the skill loader, not by direct import)
- **Example from YURI:** The 8 `organ-*` skills that failed the health gate — they existed on disk but had no hash-registry entry. Were they dead or just unregistered? The audit found they were **live but unregistered** — the fix was to register them, not delete them.

### Decision Matrix

| Signal | True Dead | Load-Bearing | Ambiguous |
|---|---|---|---|
| Zero static importers | ✅ | ❌ | ⚠️ |
| Zero dynamic registrations | ✅ | ❌ | ⚠️ |
| Zero test coverage | ✅ | ❌ | ⚠️ |
| Zero doc references | ✅ | ❌ | ⚠️ |
| No changes in 6+ months | ⚠️ (weak) | ✅ (stable infra) | ⚠️ |
| Is a hook/CLI/API | ❌ | ✅ | ❌ |
| Is a recovery path | ❌ | ✅ | ❌ |
| Convention-based loading | ❌ | ⚠️ | ✅ |

---

## 4. ARCHITECTURAL-COHERENCE AUDIT — Duplicate Subsystems

### Detection Method

**HARD-FACT.** Duplicate subsystems are the most expensive form of bloat because they create maintenance burden ×2 and confusion ×N.

**Method:**
1. **Capability-first scan** — Run `node _SYSTEM/Scripts/capability-recall.mjs "<verb noun>"` for every major capability. If two subsystems claim to do the same thing, flag them.
2. **Xref overlap analysis** — `node _SYSTEM/Scripts/xref-query.mjs "<concept>" --all` returns every file that mentions a concept. Cluster by file path prefix. If two directories both have files for the same concept, they overlap.
3. **Call-graph convergence** — If two subsystems both call into the same 3 utility modules, they may be doing the same thing differently. Trace the callers.
4. **Registry cross-check** — Compare `_SYSTEM/config/artifact-registry.json` entries against actual filesystem. Any file that exists but has no registry entry is either dead or unclassified.

**YURI's own duplicates found in wave-3:**
- `_SYSTEM/Scripts/` vs root `Scripts/` — duplicate script directories (wave-3 governance handover flagged this)
- `.claude/commands/*.md` vs `skills/*/SKILL.md` — commands that invoke skills via prose instead of `skill:` frontmatter (23 near-match aliases found)
- `brain-inject.js` IDENTITY block vs `CLAUDE.md` @-include of `SOUL.md` — ~570 tok/boot redundancy
- `eot-background-start.js` vs `user-prompt-submit.js` + `yuri-closeout.mjs` — dead organ claiming to do EOT monitoring that real EOT already handles

### Canonicalization Rule

**HARD-FACT.** When two subsystems overlap, do NOT merge them. Choose one as canonical and delete the other. Merging creates a third thing that is different from both and must be re-verified. The canonical choice is:
1. The one with more callers (higher impact centrality)
2. The one with more recent maintenance (git history)
3. The one with better test coverage
4. The one that is already registered in the artifact registry

---

## 5. AVOIDING THE EXPENSIVE MISTAKE — Anti-Patterns

### Anti-Pattern 1: "It looks unused"

**HARD-FACT.** A file with zero importers may still be load-bearing if it is:
- Loaded by convention (e.g., `require('./plugins/' + name)`)
- Loaded by a config file (e.g., `settings.json` hook registration)
- A CLI tool invoked directly (not imported)
- A skill loaded by the skill loader
- A test fixture loaded by test framework convention
- A documentation file referenced by a README

**Rule:** Before marking any file as dead, check ALL of: import graph, config registrations, CLI entry points, skill loader, test framework, documentation cross-references.

### Anti-Pattern 2: "It's never called in production"

**RECALLED-PATTERN (industry).** Google's internal studies found that 30-50% of code that appears "dead" by production coverage is actually load-bearing — it's a fallback path, an error handler, a rarely-triggered edge case, or a compliance requirement. Production coverage is a **lower bound** on liveness, not an upper bound.

**Rule:** A function with zero production hits but a known call site in the source code is load-bearing. A function with zero production hits AND zero source call sites is dead.

### Anti-Pattern 3: "Delete it, git has it"

**HARD-FACT.** Git history is not a safety net for deletion mistakes in a running system. If you delete a hook that fires on every event, the system breaks immediately. The revert takes time. The owner loses trust.

**Rule:** Staged removal (Gate 2) before hard delete (Gate 3). Always.

### Anti-Pattern 4: "It's just a small file"

**RECALLED-PATTERN (industry).** Small files are the most dangerous to delete because they are often:
- The last remaining call site of a larger subsystem
- A symlink or re-export that other things depend on
- A configuration file that controls behavior
- A marker file that a build tool checks for

**Rule:** Size is not a safety signal. Check the import graph regardless of file size.

---

## 6. CONCRETE SAFE-CUT CHECKLIST

### Pre-Cut Phase (Research)

- [ ] **Import graph complete** — Run `node _SYSTEM/Scripts/yuri-navigate.mjs --dependency <entry>` from every known entry point. Document the full reachable set.
- [ ] **Config registries indexed** — Read `settings.json` (all hook arrays), `.claude/commands/` (all command files), `_SYSTEM/config/artifact-registry.json`, `_SYSTEM/config/folder-registry.json`, `_SYSTEM/context/context-registry.json`. Every file referenced here is load-bearing.
- [ ] **Skill loader indexed** — Run `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate`. Every skill on disk but not in hash-registry is either dead or unregistered (flag for owner).
- [ ] **GitNexus graph analyzed** — Run `gitnexus_detect_changes()` to see current state. Run `gitnexus_impact({target: "<suspected-dead-symbol>"})` for each candidate.
- [ ] **Propagation scan run** — `node _SYSTEM/Scripts/propagation-scan.mjs <node-id> --dry-run` for each circuitry node in the suspected-dead set.
- [ ] **Test suite baseline** — Run full test suite. Record pass/fail. Any deletion that changes test results is suspect.

### Candidate Classification

- [ ] **TRUE DEAD** — All signals negative (no importers, no registrations, no tests, no docs, no git activity). → Gate 1 (deprecation marker).
- [ ] **LOAD-BEARING** — Any positive signal. → Do NOT delete. Document as "verified live" in the audit ledger.
- [ ] **AMBIGUOUS** — Mixed signals. → Flag for owner decision with evidence packet (import graph, registration status, test coverage, git history, doc references).

### Cut Phase (per candidate)

- [ ] **Gate 1: Deprecation marker** — Add `// DEPRECATED YYYY-MM-DD — reason. Remove after N sessions.` header. Add to deprecation registry. Commit. Push.
- [ ] **Gate 2: Staged removal** — Remove all imports/registrations. File stays on disk. Run full test suite. Run health gate. Run for N sessions (N ≥ 3). If no errors, proceed.
- [ ] **Gate 3: Hard delete** — `git rm <file>`. Update registries. Single commit per deletion batch. Commit message names every path. Push. Monitor next session for errors.

### Post-Cut Verification

- [ ] **Health gate passes** — `node _SYSTEM/Scripts/yuri-health.mjs` returns all green.
- [ ] **Test suite passes** — Full test suite green.
- [ ] **No boot errors** — Fresh session boots without errors referencing deleted files.
- [ ] **No runtime errors** — Run all major workflows (at minimum: session start, skill invocation, hook firing, EOT closeout).
- [ ] **Registry consistency** — `node _SYSTEM/Scripts/artifact-registry.mjs --validate` passes. No dangling references to deleted paths.
- [ ] **Corpus reindexed** — `ai reindex` so search doesn't return deleted files.
- [ ] **GitNexus re-analyzed** — `npx gitnexus analyze` so impact graph is current.

---

## 7. BUILD LIST — What YURI Already Has (do not rebuild)

| Capability | Tool | Status |
|---|---|---|
| Static import graph | `yuri-navigate.mjs` (DEPENDENCY/IMPACT closure) | ✅ EXISTING |
| Call-graph reachability | `gitnexus_impact()` / `gitnexus_detect_changes()` | ✅ EXISTING |
| FTS5 corpus search | `xref-query.mjs` / `ai search` | ✅ EXISTING |
| Circuitry sibling scan | `propagation-scan.mjs` | ✅ EXISTING |
| Capability-first reuse | `capability-recall.mjs` | ✅ EXISTING |
| Health gate | `yuri-health.mjs` | ✅ EXISTING |
| Skill loader validation | `yuri-skill-loader.mjs --validate` | ✅ EXISTING |
| Artifact registry | `artifact-registry.mjs --validate` | ✅ EXISTING |
| Post-build reconciliation | `post-build-reconciliation.mjs` | ✅ EXISTING |
| Autonomy runner (dry-run) | `yuri-autonomy-runner.mjs plan --goal` | ✅ EXISTING |
| Deprecation registry | **MISSING** — no centralized deprecation tracker | 🔴 BUILD |
| Staged-removal automation | **MISSING** — no script that removes imports but keeps file | 🔴 BUILD |
| Dead-export detection | **MISSING** — no per-export reachability (only file-level) | 🔴 BUILD |
| Load-bearing classification | **MISSING** — no automated decision matrix | 🔴 BUILD |

---

## 8. CUT LIST — What to Build for the Fable-5 Mastermind

### BUILD-1: Deprecation Registry (`_SYSTEM/config/deprecation-registry.json`)

**Why:** Without a central registry, deprecation markers are just comments — invisible to automation. A machine-readable registry lets the health gate warn about expired deprecations.

**Schema:**
```json
{
  "deprecated": [
    {
      "path": ".claude/hooks/eot-background-start.js",
      "deprecated": "2026-06-10",
      "reason": "Dead organ — real EOT in user-prompt-submit.js + yuri-closeout.mjs",
      "remove_after": "2026-07-10",
      "status": "staged-removal-complete",
      "replacement": ".claude/hooks/user-prompt-submit.js"
    }
  ]
}
```

**Health gate integration:** `yuri-health.mjs` checks for `remove_after` dates that have passed. If a deprecation is past its removal date, the health gate warns.

### BUILD-2: Staged-Removal Script (`_SYSTEM/Scripts/staged-remove.mjs`)

**Why:** Manual staged removal is error-prone. A script that:
1. Takes a file path
2. Finds all importers (via `yuri-navigate.mjs --impact`)
3. Removes the import statements (not the file)
4. Removes hook/command registrations from config files
5. Adds a deprecation marker to the file
6. Updates the deprecation registry
7. Runs the health gate
8. Reports what changed

This makes Gate 2 a one-command operation instead of a multi-file manual edit.

### BUILD-3: Dead-Export Scanner (`_SYSTEM/Scripts/dead-export-scan.mjs`)

**Why:** File-level dead detection is not enough. A script that:
1. Parses all exports from each module
2. For each export, searches for import references across the repo
3. Reports exports with zero importers
4. Flags exports that are only imported by test files (test-only exports)
5. Flags exports that are only imported by other dead files (transitive dead)

This catches the case where a file is "live" (imported) but 80% of its exports are dead.

### BUILD-4: Load-Bearing Classifier (`_SYSTEM/Scripts/classify-load-bearing.mjs`)

**Why:** The decision matrix in §3 is currently manual. A script that:
1. Takes a file path
2. Checks all signals: importers, registrations, test coverage, doc references, git history, hook registration, CLI entry, skill loader, convention-based loading
3. Outputs: `TRUE_DEAD`, `LOAD_BEARING`, or `AMBIGUOUS` with evidence
4. For AMBIGUOUS, produces the evidence packet for owner decision

This makes the expensive mistake (deleting something live) mechanically harder to make.

---

## RESULT LABEL

```
08DS_DEBLOAT_SURVEY_SAFE_CUT_PROTOCOL_X_PASS_COMMITTED
```