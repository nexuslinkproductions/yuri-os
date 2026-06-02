# Operation: Native-Only Control Plane — Master Plan

Status: PHASE 1-2 COMPLETE (2026-06-02). **Fresh-session start → read the "Current standpoint + fresh-session guide" section below first**, then Phase 4 + the elite-practice reference. Owner: Marcel. Lane: Claude main.
Source of truth: this file. Derived from the elite-practice research (2 rounds) + the 6-lane setup audit (run `wf_54c0bfc6-af0`).

## Objective

Collapse YURI to a **native-Claude-only control plane** and lean the harness to match how Anthropic/Boris Cherny actually operate. Three movements:
1. **Subtract** dead weight and duplication (the audit found ~807 always-on lines = 4x target; skill description budget at 118%).
2. **Enforce** verification deterministically where today it is only policy prose.
3. **Retire** the entire external-lane apparatus (Codex + ollama/local + NVIDIA/DeepSeek/Kimi) — obsolete under native-only + Opus 4.8 self-routing.

Locked decisions (owner): full-Claude-only (no Codex, no ollama/local); prune permissions to a curated allowlist; align energy-gate docs to reality (observability instrument, not a gate); reconcile stale agent-policy memories; model + fan-out self-selected per task (no Opus floor, no ≤15 cap).

## Current standpoint + fresh-session guide (2026-06-02)

**Authoritative "where we are" — trust this over any stale phase text below.**

**DONE — 9 commits on `origin/main`** (`52e4d554` `179db980` `3b40a37b` `df3d3186` `ce86aeaf` `e0621ca1` `bf721d53` `432184cf` + AGENTS.md-lean commit): offload apparatus gone at the **skill + behavior + doc** layers — offload session-rule killed; 16 skills deleted across BOTH `.claude/skills` and canonical `skills/`; Haki/Nen hook auto-fire removed; shura/clone → native Workflow; anime-DNA bodies cleaned; CLAUDE.md 330→177 + AGENTS.md leaned; skill manifest regenerated. Phase 1 ✓, Phase 2 ✓.

**LEFT:** Phase 4 (engine kill, below) + Phase-2 leftovers (permissions wildcards [OWNER-AWAKE only — lockout risk], PreToolUse empty-matcher scoping). Phase 3 (verification spine) optional.

**Reading list for a fresh session (in order):** (1) this section; (2) Phase 4 below (items 1-10; items 1/7 partly/fully done — see commits); (3) `elite-claude-practice-reference.md` (the Anthropic + pioneers guide, the *why*); (4) auto-memory `PROJ:NATIVE-ONLY-OP-RESUME-2026-06-02`; (5) the brain — `CLAUDE.md` → `_SYSTEM/yuri-origin.md` → `_SYSTEM/persona.md` → `SOUL.md`; (6) Phase-4 sources before touching — `_SYSTEM/Scripts/{offload-contract,offload-runner,shintai-dispatch,lane-kernel,memory-kernel,yuri-control-plane}.mjs`.

**Key learnings (don't repeat this session's mistakes):**
- DMI (`disable-model-invocation`) does NOT cut the skill-description budget — only stops mis-routing; budget wins come from DELETING skills.
- TWO skill trees: `.claude/skills/` (Claude-loaded) AND top-level `skills/` (YURI canonical, ~110, read by corpus/parity/self-audit). Scrap = delete from BOTH + `node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest`.
- Agent Bash CANNOT `rm`/`git rm` under `.claude/` (blanket `bash-security-guard` floor, all roles) → owner terminal. `skills/` + `_SYSTEM/` ARE agent-deletable. `Edit` into `.claude` is fine except the 8 protected guard files. Memory `--force` overwrite is also `.claude`-blocked.
- Cognitive-gate auto-fire was HOOK-driven (not Skill-invocation); izanagi/bankai auto-fire already dead (pulse-orchestrator retired). `infinity-guard` ENFORCEMENT stays a hook (safety = hooks-guarantee); only reasoning gates → model-invocable skills.
- GitNexus block is contract-enforced by `root-architecture.test.mjs`: keep `<!-- gitnexus:start/end -->` markers + all 6 `skills/gitnexus-*/SKILL.md` links in CLAUDE.md AND AGENTS.md; leaning prose is OK, stripping is NOT. **GOTCHA: `npx gitnexus analyze` re-expands BOTH blocks to the verbose template AND repoints them at `.claude/skills/gitnexus/...` (which then fails the test). After any `analyze`, re-apply the lean canonical block to CLAUDE.md + AGENTS.md and re-run `root-architecture.test.mjs` before committing.**
- Pre-commit gates: secret-scan · offload-contract-drift · root-architecture · persona-contract · skill-registry · gitnexus-scope. Quick canary before claiming done: `node _SYSTEM/Scripts/root-architecture.test.mjs`.

## Key finding that shapes sequencing

The external-lane coupling is **dynamic** (`spawn`/CLI invocation), so GitNexus static impact UNDER-reports it: `classifyComplexity` shows 3 graph callers, but `grep` shows **~16 importers of offload-contract and ~13 of offload-runner**, including load-bearing spine: `lane-kernel`, `memory-kernel` (Track A), `task-queue`, `yuri-control-plane(+schema)`, `yuri-lifecycle-controller`, `worker-tmux`, `worker-bridge`, `pulse-lane-dispatch`, and the `claude-protocol-guard.mjs` plan-dispatch hook.

**Therefore: the regression test suite is the real safety net, not the call graph.** Existing tests to run before/after every Phase-4 step: `offload-contract-regression.test.mjs`, `lane-kernel.test.mjs`, `offload-runner-rails.test.mjs`, `codex-offload-runner.test.mjs`, `protected-surfaces.test.mjs`, plus task-queue/memory-kernel tests.

## Operating principles (the dogfood)

- Reversible / low-blast-radius first; highest-blast-radius (Phase 4) last.
- Build the verification spine (Phase 3) BEFORE the risky surgery so correctness is provable.
- One branch per phase; one mutating step at a time; small reviewable diffs (Karpathy leash).
- Every mutating step names its verify command BEFORE the edit; no step claims done without green evidence (TERM_COUNT/FILE_COUNT/MATCH or a passing test).
- Owner gates every commit/push and every owner-gated step below. Claude proposes + verifies; Marcel approves.

---

## PHASE 0 — Foundation (in progress, this session)
- [x] Run impact analysis (done; finding above).
- [x] Persist this plan.
- [ ] Capture full-Claude-only direction → Track A ledger (memory-kernel propose) + Track B project memory.
- [ ] Capture research → reference doc in `_SYSTEM/` + `ai reindex` (compounds the corpus, per LOCAL-FIRST mandate).
- [ ] Reconcile stale memories: `no-haiku-agents`, `no-agent-for-file-reads` (now recommend the scrapped ollama-bridge; soften to "prefer direct tools for known reads; Agent/Workflow when fan-out/cross-file reasoning justifies it").

## PHASE 1 — Free deletions (Tranche 0) — LOW risk
Branch `cleanup/tranche-0`. Verify: fresh session loads clean; re-measure skill budget; run any touched tests.
1. Delete 8 corpus-junk "ABSORBED FROM" skills (audit-log-firewall, receipt-subscription-cleaner, agent-scout, ad-creative, nex-vault, "MinerU Document Extractor", objection-source-diagnoser, nex-deliverables) → drops skill budget 118%→~72%.
2. Delete 2 broken symlinks (remotion-best-practices, videodb) + byte-identical duplicate `gitnexus-impact-analysis/` top-level dir.
3. Delete dead `pulse-orchestrator.mjs` (self-flagged RETIRED) + `pulse-packager.mjs` + dead spawn block in `user-prompt-submit.js` + offload-contract PATCH-030 pulse fields. (Also removes offload-contract/route-plan consumers → easier Phase 4.)
4. Delete Codex Capability Bridge section (CLAUDE.md ~82–103).
5. Fix global `~/.claude/CLAUDE.md` broken `@../CLAUDE.md` + `@../SOUL.md` includes; remove double SOUL include in `.claude/CLAUDE.md`.
6. Delete deprecated `claude-protocol-guard.js` CJS shim; stale `settings.json.bak-cwdfix` + `settings.local.backup-unsafe-original.json` (owner-confirm).
7. Remove stale sharingan note falsely claiming `disable-model-invocation` unsupported.

## PHASE 2 — Lean context + hook hygiene + decisions 1&2 — LOW risk
Branch `cleanup/tranche-1-2`. Verify: re-measure always-on lines; cold-test fresh session (identity/floor intact, skills still route, no double-load).
1. Add `disable-model-invocation: true` to ~26 manual-only skills (12 anime-DNA gates, eot, report, sharingan, graphify, shura, clone, extraction-sprint, compact, pdc, spec, 6 gitnexus sub-skills, etc.).
2. Collapse CLAUDE.md duplications to pointers: GitNexus block (42→4), Adversarial-Verification (12→1), EOT (8→1), Output-Lane (30→2), Protected-Paths prose (subset of deny-list). Move v3 memory-format spec → `.claude/rules/memory-format.md` with `paths:` (verify supported; else wrapper `surfaces`).
3. Tier MEMORY.md: backfill `tier:` frontmatter (FB=working, PROJ/REF=episodic/semantic); emit only working-tier always-on; recall hook surfaces the rest.
4. Permissions (decision 1): remove `Bash(*)`/`Read(*)`/`Write(*)`/`Edit(*)` wildcards from `allow` in settings.json + settings.local.json so the curated allowlist governs; keep deny arrays + JS guards. Use `/fewer-permission-prompts` to seed the safe allowlist.
5. Hook hygiene (Tranche 5): re-scope the 8 PreToolUse guards to the tools they gate (Bash-only guards under `Bash` matcher); add `timeout: 2000` to brain-inject git calls; enable MCP tool-search so gitnexus ~18 schemas load on demand.
6. Energy-gate docs (decision 2): soften CLAUDE.md "Brain & Body" from "scores claim soundness before asserting" to "observability instrument recording work-dynamics ΔU." Do NOT make it a blocker (would duplicate deny hooks).

## PHASE 3 — Verification spine (Tranche 2) — MEDIUM. Build the safety net before Phase 4.
Branch `feat/verification-spine`. Verify: cold-test each hook; confirm fail-open + no lag; sprint-bypass works.
1. Add `acceptanceCriterion` + `verifyCommand` (+ `criterionType: manual|auto`) to `task-queue.mjs` newTask(); wire `spec-pipeline.mjs` extractAcceptanceCriteria → task record. Mark `done` ONLY when verifyCommand exits 0 (or manual-attested).
2. `evidence-grammar-validate.mjs`: bind every `RESULT_LABEL ... _X_PASS` to a conforming TERM_COUNT/FILE_COUNT/MATCH line; fire only when a PASS label is present (no false-block on chatter).
3. PostToolUse lint hook (Edit|Write|MultiEdit, file-scoped, `node --check` for JS, hard timeout, opt-in env) → emit failures as additionalContext (self-heal). NOT repo-wide.
4. Stop-hook verification gate: read active task; if `verifyCommand`, run it; on fail emit `decision:block` (or WARN first iteration) with reason; hard timeout; max-block count; `YURI_SPRINT_MODE` bypass; fail-open on hook error.
5. `yuri-lifecycle-controller.mjs`: add `enforce` mode (per-lane; observe default) — verification.json fail/missing refuses promotion to canonical.
6. PreCompact survival hook: preserve modified-files + active task + test commands into post-compact context (reuse session-checkpoint snapshot reader).

## PHASE 4 — Native-only retirement — HIGH blast radius. LAST. Test-gated, one consumer at a time.
Branch(es) `refactor/native-only-*`. Owner-gated. **Pre-flight: snapshot a green baseline across all listed regression tests; abort any step that reddens them.**
1. **Scrap ollama/local:** remove ollama-bridge MCP server + config, `local-subagent` skill, ollama refs in tokenmaxxing/sharingan, local lanes in models.json + offload-contract.
2. **Untangle leaf consumers** (not the spine): independence-check, self-audit, yuri-local-model-benchmark, yuri-supercharge-gate, worker-tmux, worker-bridge, pulse-lane-dispatch, pulse-classify-stdin, yuri-sandbox-loop, deepseek-guarded-handoff, kagami-facade, yuri-workhorse, memory-proposal-autopilot, yuri-guarded-executor, policy/yuri-safety-core, math/yuri-energy-dispatch-bridge. For each: needs routing engine → retire dep; needs a small util → inline it. Test after each.
3. **Untangle `task-queue.mjs` from offload-runner** (owner-named): replace external dispatch with native execution or strip dispatch entirely → pure native task store. Coordinate with Phase-3.1 fields. Test task-queue.
4. **Untangle `memory-kernel.mjs` from offload-contract** (owner-named): replace lane-routing of memory proposals with native. memory-kernel itself STAYS as Track A mediator. Test memory-kernel.
5. **Untangle `lane-kernel` + `yuri-control-plane(+schema)`** (the dispatch core): external-lane dispatch → native (Workflow/Agent). Test lane-kernel.
6. **Rework `claude-protocol-guard.mjs` plan-dispatch gate:** decide thin native `route-plan` stub vs retire the gate; remove offload-contract dependency. Test the protocol-guard hook test.
7. ~~**Rewrite `yuri-shura` + `parallel-clone-orchestrator`** from dead NVIDIA/DeepSeek fan-out → native~~ — **DONE 2026-06-02 (commit e0621ca1):** both route through the native Workflow tool; shura keeps the 7-vector adversary checklist.
8. **tmux → native worktree (Tranche 4 + owner's tmux-workaround greenlight):** the 3-pane shared-tree `yuri-workers-tmux.sh` was a manual workaround for native parallelism. Replace with native Workflow-tool fan-out where possible; for parallel MUTATING work use per-lane `git worktree add` + collision pre-check + `.worktreeinclude` env-seed. Read-only lanes keep sharing the tree.
9. **Delete the husks:** once all consumers green, delete `offload-contract.mjs` + `offload-runner.mjs` + **`shintai-dispatch.mjs`** (1401-line SEAL-team multi-lane dispatch — same offload-workaround class; spine-coupled: imports lane-kernel/memory-kernel/evidence-contract/control-plane and is imported by `memory-kernel` + `yuri-control-plane` + `yuri-supercharge-gate` + `rick-repl`, so untangle those first per items 2/4/5) + dead external-lane defs in models.json + orphaned lane-* machinery + retire/rewrite their tests. Final full test sweep.
10. **Doc sync:** CLAUDE.md / yuri-origin.md / AGENTS.md adapters → native-only; remove offload-contract references; reflect model + fan-out self-select.

## Open decision for Phase 4.8
Does the native **Workflow tool** fully replace the bespoke tmux/worktree lane harness for parallel work, or do we keep a thin worktree-tmux path for long-running interactive lanes? (Workflow = in-session fan-out; worktree-tmux = persistent interactive panes. Likely: Workflow for bounded fan-out, worktree only for parallel mutating implementation that must persist.)

## Session log — 2026-06-02 (autonomous, owner resting)

**DONE (safe, reversible, uncommitted):**
- CLAUDE.md leaned 330 → 213 lines (−117): deleted Codex Capability Bridge section; collapsed Output-Lane, v3-memory-format, Adversarial-Verification, EOT to pointers; aligned the energy-gate description to reality (observability instrument, not a blocking gate — decision 2). @-includes + gitnexus auto-block preserved; structure verified.

**BOUNDARY found (verified against the guard source) — narrower than first thought:**
- Session is already `dev` (`yuri-operator status` → role:dev, dev_key_present:true). The `.claude` destructive block in `bash-security-guard.js` runs AFTER the coworker check → it is a BLANKET safety floor for ALL roles incl. dev. A restart does NOT lift it. Did NOT bypass (correct floor — keep it).
- ONLY blocked for the agent: **Bash destructive ops on `.claude/` paths** (rm / git rm / broad git add) → `.claude/skills` deletions + the `.claude/hooks/claude-protocol-guard.js` shim removal. These need the OWNER'S OWN TERMINAL (his shell isn't gated by the Claude PreToolUse hook).
- NOT blocked for the agent: `.claude` EDITS via Edit/Write tool (skill DMI frontmatter, settings.json, new `.claude/rules`, new non-guard hooks) — `operator-write-guard` only protects the 8 guard/hook files. And ALL `_SYSTEM/` Bash incl. deleting `offload-contract.mjs` + `offload-runner.mjs`. So Phases 2, 3, and most of 4 ARE agent-doable.
- Only Phase-4 piece needing owner terminal / protected-file edit: reworking `.claude/hooks/claude-protocol-guard.mjs` (a protected guard file).

**Owner-terminal runbook (role-independent — agent's hook can't do `.claude` bash-deletes; your shell can):**
```
# Phase 1 .claude deletions (all tracked, reversible):
git rm -r ".claude/skills/audit-log-firewall" ".claude/skills/receipt-subscription-cleaner" \
  ".claude/skills/agent-scout" ".claude/skills/ad-creative" ".claude/skills/nex-vault" \
  ".claude/skills/MinerU Document Extractor" ".claude/skills/objection-source-diagnoser" \
  ".claude/skills/nex-deliverables" ".claude/skills/remotion-best-practices" \
  ".claude/skills/videodb" ".claude/skills/gitnexus-impact-analysis" \
  ".claude/hooks/claude-protocol-guard.js"
# 2 untracked backups (manual, not git-reversible — owner confirm):
#   rm .claude/settings.json.bak-cwdfix .claude/settings.local.backup-unsafe-original.json
```
Pre-checked: no commands/ or offload-contract reference the deleted skills; nested gitnexus impact skill + dispatcher remain.

## Verification ledger (fill as phases complete)
- Phase 1: ✓ DONE 2026-06-02 — CLAUDE.md leaned; 11 junk skills + guard shim deleted (owner ran the `.claude` git-rm). Commits 52e4d554, 179db980.
- Phase 2: ✓ DONE 2026-06-02 — offload session-rule killed; manual-skill DMI; Haki/Nen hook auto-fire removed; offload skill-layer + graphify/report scrapped (both `.claude/skills` AND canonical `skills/`) + manifest regen; shura/clone → native Workflow; anime-DNA body hygiene; CLAUDE.md + AGENTS.md GitNexus blocks leaned. Commits 3b40a37b, df3d3186, ce86aeaf, e0621ca1, bf721d53, 432184cf + handoff commit.
- Phase 3 (verification spine): not started — optional; see Phase 3 above.
- Phase 4 (engine kill) + Phase-2 leftovers (permissions/hooks): NEXT — fresh session. Pre-flight baseline + reading list in the handoff doc.
