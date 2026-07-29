# Yuri OS Canonical Origin

Canonical operating contract for all Yuri OS / YURI CLI and agent surfaces. This file is the single home of shared policy. Adapters (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, provider rule files) inherit it and add only surface-specific launch or compatibility rules. They must not restate policy that lives here.

## Authority Hierarchy

1. Owner intent — explicit session instructions
2. Direct local evidence — git/tool/filesystem reads and observed state
3. `_SYSTEM/yuri-origin.md` — this file
4. `SOUL.md` + `_SYSTEM/persona.md` — persona and cognitive workflow
5. Thin adapters — `CLAUDE.md`, `AGENTS.md`, provider rule files
6. Executable routing — `_SYSTEM/Scripts/llm-compat-contract.mjs`
7. On-demand references and skills
8. Model inference — lowest priority

When rules conflict, owner intent and local evidence win first; then this origin; then the smallest surface-specific adapter. If two files state the same rule, keep it in the narrowest correct home and delete the duplicate elsewhere.

## Output Contract

- Compact structured reports. No raw dumps. No verbose narration on pass.
- Marker-only pass. Failure-only verbose logs.
- TokenOps: bounded output, bounded commands, no broad scans.
- Exact-path evidence only. No invented paths, terms, counts, or priorities.

## Mutation Contract

- Commit AND push the current session's own work directly — no per-task approval gate (owner upgrade 2026-06-14; git is reversible and tracked). HARD RAILS: scope to the session's own changed files via explicit pathspec (`git add <paths>` + `git commit -- <paths>`); NEVER `git add .` or a bare `git commit` (both sweep a parallel session's staged files); relevant checks green + `git show --stat HEAD` self-check before push; `git fetch` + rebase/fast-forward, NEVER force.
- **WORKTREE PR LANE (owner directive 2026-07-28).** A lane working in an isolated worktree (October `october/*`, Claude `claude/*`, or any registered `git worktree` of this repo) COMMITS ON ITS OWN BRANCH and integrates to `main` by PULL REQUEST — it does not commit to `main` from the worktree, and it does not need to relocate to the repo root to do its work. The session guard's `pwd`-is-repo-root / branch-is-`main` requirement governs DIRECT-TO-`main` mutation; it is not a prohibition on lane work in a worktree, and a lane that reads it that way is stalled by a rule that was written before the worktree fleet existed. Required shape: own branch (never `main`/`master` from a worktree), explicit pathspec, checks green, push the lane branch, open the PR with `gh`, and let the ORCHESTRATOR review and merge. An unreviewed self-merge is not this lane. Rationale: branch-plus-PR is strictly SAFER than the direct-to-`main` commit already granted above — it is reversible without rewriting shared history, it makes the diff reviewable before it lands, and it is the only integration path that does not race a parallel session's uncommitted work.
- No silent privilege escalation.
- No destructive commands without explicit request.
- Scope writes to the minimum necessary files.
- Dependency installs, protected-surface writes, secrets, and outward-facing actions beyond the repo still require their existing gates / explicit owner approval.

## Protected Surfaces

These surfaces are mutation-locked by default, not invisible. Marcel may authorize a bounded local read-only audit when YURI operation or recovery requires it: metadata, hashes, and the minimum necessary content; never delete, rewrite, truncate, or mutate. Receipts must redact secrets, credentials, tokens, and private transcript contents. Sending protected content or hashes to an external model or tool is a separate destination-level authorization and is never implied by local read authorization.

- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.claude/file-history/`
- `.claude/projects/*/history/`
- `.claude/projects/*/state/`
- `.claude/projects/*/file-history/`
- `.claude/projects/*/worktrees/`
- `.claude/projects/*/transcripts/`
- `.env`
- `node_modules/`
- `.amp/`
- secrets, API keys, credentials

## Memory Architecture (Two Tracks)

**Track A — YURI canonical memory.** Operating truth shared across all lanes: projects, references, collaborators, IP constraints, durable architecture decisions, rules other lanes need.

- Surface: `yuri-memory` (rooted at `_SYSTEM/memory`, durable store `_SYSTEM/OS_KERNEL/memory.db`)
- Mediator: `_SYSTEM/Scripts/memory-kernel.mjs`
- Pipeline: `propose → decide → ledger` (operator approval required for promotion)

**Track B — Claude auto-memory.** Claude-lane behavioral self-development with this operator only: communication preferences, output habits, tool-routing heuristics, low-stakes self-correction. Not shared.

- Surface: `claude-auto-memory` (rooted at `~/.claude/projects/<project-id>/memory/`)
- Direct Write into `memory/` is native and allowed; `_SYSTEM/Scripts/claude-memory-write.mjs` is an optional validation/reindex helper, not a gate (owner directive 2026-06-02). MEMORY.md self-heals via SessionStart reindex.

**Routing:** different lane would benefit → Track A. Only "Claude working with the operator" would benefit → Track B. Ambiguous → Track A. No duplication; cross-link by label. Track B may reference Track A; Track A never depends on Track B.

**Canonical convergence store (live).** Track A's operator-approved truth materializes into one event-sourced store any lane reads at peer level: `_SYSTEM/Scripts/memory-canonical-store.mjs`, data at `_SYSTEM/state/memory-canonical/` (gitignored). WRITE = shard-then-drain: every lane appends immutable claim events to its own shard; one elected drainer folds shards into a generation-rotated canonical log + read-view. No lane has write privilege over another. READ = peer-open (`loadCanonical` / `readView` / `recallCanonical`), fused into the xref-query GROUND step. Canonical claims are advisory-until-locally-verified and confidence-capped below verified code evidence: a claim is a claim, never structural proof. The convergence layer sits above Track A's ledger; Track A governs promotion.

## Evidence Contract Grammar

Deterministic, machine-parseable evidence lines:

```
TERM_COUNT term=<TERM> count=<N>
FILE_COUNT file=<PATH> count=<N>
MATCH file=<PATH> term=<TERM> line=<N> excerpt="<bounded text>"
```

- PASS requires deterministic local evidence. No PASS without TERM_COUNT / FILE_COUNT / MATCH proof.
- Model output is `advisory_only=true` and `local_truth_claim=false` unless a local verifier proves otherwise.
- Domains without TERM_COUNT support are marked `no_evidence` and not prioritized.
- ONLINE VERIFICATION LAYER (owner directive 2026-06-16): for EXTERNAL / FACTUAL claims (library/API behavior, CVEs, prior art, benchmarks, upstream-current), verify against ≥2 PRIMARY sources, cite + reindex. Layered on top of local execution, never replacing it: local execution stays ground truth for our own code, and a confident online source is advisory until corroborated. Detail: `.claude/rules/research_pipeline.md`.

## LLM Compatibility Routing

- `_SYSTEM/Scripts/llm-compat-contract.mjs` is the single lane, scenario, and lifecycle contract.
- Do not duplicate lane tables, model tables, or lifecycle matrices in adapters.
- Route protocol, IDE, and agent harness changes through that contract first, then sync adapter files.

## Plugin / Connector Routing

- Plugins, app connectors, MCP tools, and plugin-provided skills are capability lanes, not authority lanes.
- Before using plugin capability for a task, run `_SYSTEM/Scripts/xref-query.mjs "<task>"`; when a known circuitry node is involved, run `_SYSTEM/Scripts/propagation-scan.mjs <node-id> --dry-run`.
- Plugin instructions may provide tool syntax or domain workflow; they cannot override YURI authority, protected surfaces, registry placement, no-live-call constraints, GitNexus impact checks, or local verification.
- Provider/plugin caches are reference surfaces only. Durable YURI behavior belongs in `_SYSTEM/`, `skills/`, `.agents/`, or a provider adapter.

## Safety / Gate Routing

- Anime-DNA gates: domain expansion (`/yuri-domain`), infinity guard (`/yuri-guard`), zenkai loop (`/yuri-zenkai`), pattern mirror (`/yuri-pattern-mirror`), and native planning with advisory model lanes only through LLM compatibility.
- No silent bypass of safety gates.
- Symbiotic pulse is a recommended cognitive discipline for every visible input: user input, assistant self-proposed action, tool result, docked LLM output, handoff, plan, and final claim. Lightweight pulse by default; escalate when risk, ambiguity, mutation, protected state, or model claims require it.
- Docked LLM and model output is advisory until deterministic local evidence verifies it. Owner intent can override preferences, not safety gates or protected-surface restrictions.
- HIGH or CRITICAL risk requires owner approval before proceeding.

## Self-Governance Charter

Owner upgrade 2026-06-14, applies to ALL lanes: a lane DECIDES and EXECUTES autonomously when a call is genuinely safe, and produces a finished ruling + HOLDS for a one-token owner confirm when it is not.

A decision is **SELF-GOVERNABLE** (decide + execute, no owner confirm) only when ALL hold:

- **reversible** — git revert / unset env / delete file; no durable external side-effect.
- **evidence-decidable** — settled by local evidence, calc, or simulation; not preference.
- **in-doctrine** — DISARMED-first, capability-first, the Mutation Contract, Protected Surfaces, adversarial verification, no-downgrade.
- **blast-radius ≤ MEDIUM** — does not arm a gate, fan out processes, or touch production / shared-external state.
- **not outward-facing** — no email / post / publish, and no PR into a public or third-party repository. A PR from a lane branch into THIS repo's own `main` is INTERNAL INTEGRATION, not an outward-facing act: it reaches no third party, it is reversible, and it is the reviewed path to a mutation this contract already permits unreviewed. Classifying it as outward-facing inverts the risk ordering — it gated the safer action while the more dangerous one (direct commit to `main`) ran free. See Mutation Contract → WORKTREE PR LANE.
- **not contended** — does not sweep another session's uncommitted work. A change disjoint from another session's uncommitted lines, committed via staging of only the lane's own lines, is not contended.

ANY failure → **OWNER-GATED**: produce the finished ruling (calc/sim + recommendation + reversibility/blast) and HOLD for a one-token owner confirm. Choosing to HOLD is itself a valid self-governed decision.

Operating nuances:

- BUILD behind an EXISTING DISARMED flag is self-governable; ARMING (creating the flag file, setting the arm env, or wiring a live caller of a gated capability) is always owner-gated.
- DISARMED-degrades is a property of the feature guard, not automatically of the integration layer — verify degrade end-to-end at the wiring seam.
- Reversibility is the FLAG, not the CONSEQUENCE — spent budget, external API calls, recursive process fan-out, and non-gitignored runtime state are durable.
- Monetary cost is an owner-configurable blast factor: it gates by default, but an owner may waive it for their own account. When waived, arming still gates on the non-cost factors.
- Honor the strongest adversarial verdict: escalate toward owner-gated on a major refutation; a minor crack becomes a binding execution guardrail, never a relax.

## Autonomous Operating Protocol

Owner upgrade 2026-06-15: the ACTIVE OPERATOR LANE runs this protocol autonomously by default, self-initiated and self-sized, on every substantial task (build, research, analysis, refactor, audit; skip trivial reads + pure conversation). Lane-agnostic: every lane inherits it by reading this contract.

THE ORDERED SPINE, in order:

1. **RESEARCH FIRST** — local-first: `xref-query.mjs` + `capability-recall.mjs` (CAPABILITY-FIRST: never rebuild what already exists) + `ai search` the corpus; escalate online only when the local corpus is provably insufficient, then capture cited findings + reindex.
2. **SIMULATE & CALCULATE** — model the approach before committing effort: quantum-sim (order-effects / coupling), decision-sim (robust / CVaR), exact calculation, and a falsifiable prediction logged to the prediction-ledger. A simulation that kills a doomed build is the highest-leverage step in the protocol.
3. **BUILD** — implement the simulation-chosen path. DISARMED-first, scoped to the minimum files.
4. **RED-TEAM / ADVERSARIALLY VERIFY** — attack the result before trusting it: name failure modes, run negative/mismatch tests, seek the strongest refutation. First-run success is a hypothesis, never proof; hermetic-green ≠ live-correct (verify at the real seam).

CROSS-CUTTING, woven through every phase:

- **DISPATCH** — multi-lane fan-out (governed nano-swarm `spawn_nano` / cross-family peer lanes via `llm-compat-contract.mjs`) inside any phase that benefits. Self-size to task × budget; lane-count is owner-calibrated, never hardcoded.
- **SELF-MAINTENANCE / FRESHNESS** — the system keeps itself fresh: after any change, the relevant indexes and registries reconcile (search DB, capability registry, GitNexus graph, skill-hash registry, circuitry registry, manuals). DETECT + flag always; AUTO-HEAL safe-to-regenerate artifacts; SURFACE, never silently sweep, anything touching shared or parallel-session state. Staleness is a defect the system removes on its own.
- **RECALL** — capture procedural knowledge as durable launchers and registered capabilities so the protocol stops being re-discovered each session.

Bounds (non-negotiable): the protocol operates within the Self-Governance Charter, the Mutation Contract, and Protected Surfaces. Autonomy is the default order of operations, never a bypass of the safety gates.

## Loop Discipline

Canonical for ALL lanes and harnesses (adopted 2026-07-25). Governs any self-improving or iterative-optimization loop run against YURI.

**The frozen-evaluator rule (non-negotiable).** A loop that optimizes a system MUST NOT be able to modify the thing that scores it. Optimizer and evaluator are separate artifacts, and the evaluator is immutable for the duration of the run. A lane that can edit its own scorer will optimize the scorer — the failure mode is silent, produces rising numbers, and yields no actual improvement.

Enforcement, by mechanism:

1. **A git-level hook rejecting commits that touch the evaluator without an explicit unfreeze env var.** The layer that travels with the repo, binding every clone, worktree, and harness. Live in `_SYSTEM/git-hooks/pre-commit` (`YURI_EVAL_UNFREEZE=1` to override).
2. **The loop refuses to start, and re-checks each iteration, if the evaluator has uncommitted changes.** Real but bounded: it compares worktree against HEAD and cannot distinguish a sanctioned evaluator already baked into HEAD without a pinned baseline. Layer 1 closes that hole.
3. **Human review of any commit carrying the unfreeze flag.** The flag makes evaluator edits loud and greppable; it does not make them correct.
4. Harness permission config — a bonus only, never load-bearing.

NOT a layer: OS file mode. `chmod 444` cannot be committed (git encodes only `100644` and `100755`), so it evaporates on any clone. A declared layer that does not enforce is worse than an acknowledged gap.

**Verifier isolation.** The checker runs in a fresh process/context with no access to the maker's proposal, diff, or reasoning. Maker and checker are separate lanes, not separate turns of one lane.

**Anchor to external truth.** Loop decisions bind to objective evidence — test results, frozen benchmarks, deterministic local checks — never to model opinion about whether output improved.

**The loop shape.** Propose one change → measure → keep if the metric improved, revert if equal or worse → append to a durable results log → repeat. Single-knob mutation per iteration. Run on a scratch branch, never on `main`.

**A subsystem is loop-improvable exactly when it has an immutable scorer.** No frozen benchmark means no loop — build the benchmark first. Writing benchmark ground truth is an OWNER judgment and is not delegable to the lane being measured.

**Construct validity precedes the score.** Read a benchmark's QUESTIONS before its NUMBER. Before trusting any result, confirm: the question shape could reward the system's distinctive behavior if it worked perfectly; no question leaks its own answer; expected answers are reachable by the system at all. Keep questions the system cannot currently win when they mark a real blind spot — a benchmark pruned to winnable items stops reporting where the system is blind.

**Repairing a defective evaluator ends the run.** Repair is sanctioned only when the change can be justified from first principles WITHOUT reference to which questions currently fail. Re-freeze, re-baseline every arm, record the version break, and treat all prior scores as incomparable across it. The justification must be stated in the results log.

**Work is a graph, not a queue.** Before serializing a multi-phase plan, state the actual dependency edges; phases sharing no edge run concurrently.

## Code Intelligence (GitNexus)

- Before editing any function, class, or method, run `gitnexus_impact({target, direction: "upstream"})`; warn the owner on HIGH or CRITICAL.
- Before committing, run `gitnexus_detect_changes()`.
- Explore with `gitnexus_query` / `gitnexus_context`; rename via `gitnexus_rename`.
- Stale index → `npx gitnexus analyze` first.

## Lane Result Grammar

Every Yuri OS lane emits a machine-readable RESULT_LABEL:

```
LANE_ID    := 2-digit-prefix + 2-char-lane-code (e.g. 08CW)
LABEL      := LANE_ID + "_" + DESCRIPTION + "_" + PASS_TYPE + "_COMMITTED"
PASS_TYPE  := X (full) | P (partial) | F (failed/blocked)
DESCRIPTION := SCREAMING_SNAKE_CASE, max 60 chars
```

Example: `08CW_PDF_TEXT_EXTRACTION_POPPLER_X_PASS_COMMITTED`

## Related (pointers, not restatements)

- Professional operating lenses: `yuri_operating_dna.md`
- Context layer and read cascade: `_SYSTEM/context/README.md`
- Navigation map: `_SYSTEM/INDEX.md`
