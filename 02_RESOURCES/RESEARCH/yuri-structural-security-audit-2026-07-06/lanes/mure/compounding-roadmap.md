**Confirmed: `codex-offload-runner.mjs` is LIVE, not dead.** Four scripts actively spawn it:
- `yuri-sandbox-loop.mjs` — passes `RUNNER_PATH --dry-run`
- `memory-proposal-autopilot.mjs` — spawns `CODEX_RUNNER` with a model arg
- `worker-bridge.mjs` — spawns `CODEX_RUNNER task.lane`
- `task-queue.mjs` — spawns `CODEX_RUNNER task.lane`

S2's "CONFIRMED dead" verdict on `codex-offload-runner.mjs` is FALSE. This is exactly the class of error the mission's own `verify-cuts` subtask warned about: "a sibling lane already found the inventory over-claimed dead/redundant items that were actually live." The synthesist must carry this correction.

Now I have everything needed for the compounding roadmap. Let me compile the evidence.

---

## SYNTHESIS: The Compounding Roadmap for YURI Cuts + Hardening

### Source Material (7 lane outputs, all read in full)

**TERM_COUNT** term=yuri-structural-security-audit-2026-07-06 count=1
**FILE_COUNT** file=02_RESOURCES/RESEARCH/yuri-structural-security-audit-2026-07-06/lanes/ count=15
**MATCH** file=02_RESOURCES/RESEARCH/yuri-structural-security-audit-2026-07-06/lanes/S1-security-redteam.md line=1 excerpt="# S1: Security Red-Team — Yuri-as-an-Agent Attack Surface"
**MATCH** file=02_RESOURCES/RESEARCH/yuri-structural-security-audit-2026-07-06/lanes/S2-debloat-synthesis.md line=1 excerpt="# S2: De-bloat / Consolidation Synthesis — Fable-5 Mastermind Cut"

---

### Corrections to sibling findings (verified this session)

**CRITICAL CORRECTION: `codex-offload-runner.mjs` is NOT dead.**
S2 classified it as "DEAD — confirmed, archive" with "zero live callers outside archives/worktrees." This is FALSE. Four live scripts spawn it as a subprocess runner:

**MATCH** file=_SYSTEM/Scripts/yuri-sandbox-loop.mjs line=21 excerpt="const RUNNER_PATH = path.join(SCRIPT_DIR, 'codex-offload-runner.mjs');"
**MATCH** file=_SYSTEM/Scripts/memory-proposal-autopilot.mjs line=25 excerpt="const CODEX_RUNNER = path.join(SCRIPT_DIR, 'codex-offload-runner.mjs');"
**MATCH** file=_SYSTEM/Scripts/worker-bridge.mjs line=34 excerpt="const CODEX_RUNNER = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'codex-offload-runner.mjs');"
**MATCH** file=_SYSTEM/Scripts/task-queue.mjs line=34 excerpt="const CODEX_RUNNER = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'codex-offload-runner.mjs');"

Removing it would break the sandbox-loop, memory-proposal-autopilot, worker-bridge, and task-queue execution paths. **KEEP.**

Confirmed-dead (verified zero live callers):
**MATCH** file=_SYSTEM/Scripts/lane-dispatcher.mjs — 0 live refs (only worktree/archive copies) — **SAFE TO CUT**
`pulse-lane-dispatch.mjs` has 2 refs but both are comments in other files naming it historically — **SAFE TO CUT**

---

### The Lattice: 5 Findings, 1 Graph

All 7 lanes independently converge on a single root structure. Here it is as a directed lattice where each node makes its downstream nodes easier to act on:

```
                    ┌─────────────────────────────────────────────────┐
                    │  NODE 0: THE THREE DRIFTED DENYLISTS             │
                    │  (root cause — 3 independently maintained       │
                    │   protected-path lists that WILL drift)          │
                    └──────────────────────┬──────────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
          ┌─────────────────┐  ┌─────────────────────┐  ┌──────────────────┐
          │ NODE 1: VOICE   │  │ NODE 2: FLEET GATE  │  │ NODE 3: HOOK TAX │
          │ BRAIN GATE      │  │ COVERAGE GAPS       │  │ (44 hooks, 3     │
          │ (outside hook   │  │ (missing .git/,     │  │  real; 31 advis.)│
          │  chain; bespoke │  │ ~/.claude outside)  │  │                  │
          │  regex #3)      │  │                     │  │                  │
          └────────┬────────┘  └──────────┬──────────┘  └────────┬─────────┘
                   │                      │                      │
                   └──────────┬───────────┘                      │
                              ▼                                  │
               ┌──────────────────────────────┐                  │
               │ NODE 4: UNIFIED GATE         │                  │
               │ (route all 3 surfaces through │◄─────────────────┘
               │  one evaluateToolCall)        │  (collapse advisory
               │                               │   hooks after gate
               └──────────────┬───────────────┘   is unified)
                              │
                              ▼
               ┌──────────────────────────────┐
               │ NODE 5: SAFE AUTONOMY        │
               │ (session-level risk counter   │
               │  for overnight; taint-tracking│
               │  on untrusted tool output)    │
               └──────────────────────────────┘
```

---

### Cross-Domain Transfers (the Synthesist's contribution)

**Transfer 1: Single Source of Truth → Capability-Based Security**
- **Source:** Software architecture (DRY principle, single canonical implementation)
- **Target:** YURI agent security (3 drifted denylists)
- **Shared mechanism:** One function, N callers. Drift becomes structurally impossible because there's only one list.
- **Mismatch:** Code DRY is about maintenance cost; security DRY is about coverage gaps that are exploitable. The stakes are asymmetric — a missing entry in one of three lists is a live vulnerability, not a code smell.
- **Confidence:** HIGH (0.9). The mechanism (`evaluateToolCall` already exists, is exported, is tested, handles shell/write/edit/multiedit uniformly) is verified in code this session.

**Transfer 2: Taint Tracking → LLM Agent Input Provenance**
- **Source:** Operating-system security (tainted input from untrusted sources)
- **Target:** YURI agent (tool output from `read_doc`, screenshots, `fetch_url` flowing back into model context as if authoritative)
- **Shared mechanism:** Tag data by origin; gate downstream actions that consume tainted data more strictly than actions consuming trusted data.
- **Mismatch:** OS taint tracking is byte-level and deterministic; LLM taint is semantic and probabilistic (the model decides whether to act on it). A soft version — "treat fetch_url/read_doc output as advisory in the tool_result framing" — is the feasible proxy.
- **Confidence:** MEDIUM (0.6). Conceptually sound; implementation boundary is fuzzy.

**Transfer 3: Tower of Hanoi → Sequencing Cuts**
- **Source:** Constraint-satisfaction (move the smallest piece first to unlock the larger moves)
- **Target:** YURI de-bloat sequencing
- **Shared mechanism:** The cheapest reversible cut (archive 2 dead dispatchers) creates the confidence and momentum to tackle the harder structural cut (unify the gate).
- **Mismatch:** Tower of Hanoi is deterministic; de-bloat sequencing is risk-weighted by blast-radius and reversibility.
- **Confidence:** HIGH (0.85). The safe cuts genuinely reduce cognitive load before the structural surgery.

---

### THE COMPOUNDING ROADMAP (6 phases, ordered by leverage)

Each phase makes the next easier. Each is independently shippable and reversible (except Phase 4b).

---

#### **PHASE 0 — THE HIGHEST-LEVERAGE FIRST MOVE: Unify the voice-brain gate onto `evaluateToolCall`**

This is the single change that makes everything after it easier. Here's why:

**It closes the root cause, not a symptom.** The voice brain (`yuri-z-brain.py`) runs OUTSIDE the Claude Code hook chain — its own 8-token protected-path tuple and ~90-line regex is a third independently-maintained denylist that has already drifted (missing `~/.aws/`, `~/.npmrc`, `~/.docker/config.json`, keychain — S1 finding #4, verified this session).

**It eliminates 3 CRIT/HIGH security findings in one move:**
- S1 #1 (CRIT): voice brain outside hook chain → routes through the same gate as fleet lanes
- S1 #2 (CRIT): confirm-gate matches command syntax not intent → the unified gate's allow/deny primitive becomes the floor; the brain's AFFIRM/NEGATE UX layers on top
- S1 #4 (HIGH): drifted denylist → replaced by `PROTECTED_TARGETS` in the canonical gate

**It compounds:** after this, there are TWO denylists (bash-security-guard + yuri-safety-core) instead of three. Phase 2 (fleet gate gaps) becomes trivial because you're patching ONE list, not coordinating across two. Phase 3 (hook de-bloat) becomes safe because you know the real enforcement is in one place.

**Smallest version that ships:** Add a subprocess call from `yuri-z-brain.py:_exec_tool` to `node _SYSTEM/Scripts/policy/yuri-safety-core.mjs --check` (or an HTTP endpoint) before dispatching bash/write/edit. Preserve the brain's own conversational confirm on top. The gate becomes the floor; the UX stays.

**Risk:** MEDIUM (cross-language call needs a shim). **Reversibility:** HIGH (revert to inline regex).

**Evidence:**
**MATCH** file=_SYSTEM/Scripts/policy/yuri-safety-core.mjs line=57 excerpt="export function evaluateToolCall(toolName, toolInput = {}, opts = {})"
**MATCH** file=_SYSTEM/Scripts/voice/yuri-z-brain.py line=296 excerpt='PROTECTED = (".env", "backend/data/", ".claude/state/", ...'
**MATCH** file=_SYSTEM/Scripts/voice/yuri-z-brain.py line=367 excerpt="def _is_critical_call(name: str, args: dict) -> bool:"

---

#### PHASE 1 — Safe cuts (the warmup that builds confidence)

Archive the 2 confirmed-dead dispatchers. These are the smallest reversible moves that reduce surface area before the structural work.

**CUT (CONFIRMED dead, zero live callers):**
- `lane-dispatcher.mjs` — 0 live refs, genuine orphan (verified this session)
- `pulse-lane-dispatch.mjs` — 2 refs are comment-only historical mentions

**DO NOT CUT (S2 was WRONG — these are live):**
- `codex-offload-runner.mjs` — 4 live callers spawn it (yuri-sandbox-loop, memory-proposal-autopilot, worker-bridge, task-queue)
- `nano-compact-gate.mjs`, `spreading-activation-gate.mjs` — S2 confirmed LIVE (imported by nano-swarm plumbing + energy path)

**Effort:** 10 minutes. **Risk:** LOW. **Compounds:** reduces the "594 scripts" number and makes the dispatch topology clearer for Phase 2.

---

#### PHASE 2 — Patch the unified gate's coverage gaps

After Phase 0 unifies the gate, add the missing entries to `PROTECTED_TARGETS` in `yuri-safety-core.mjs` (the ONE list):

- `.git/hooks/`, `.git/config` (S1 #5 — `.git/hooks/pre-commit` persistence path)
- `~/.claude/settings*.json` outside project root (S1 #5)
- `~/.aws/`, `~/.npmrc`, `~/.docker/config.json`, `~/.gitconfig`, keychain paths (S1 #4)
- Scope `write_file` as CRITICAL when target is outside repo root OR under a sensitive new-file denylist (S1 #3 — new-file creation is ungated)

**Effort:** 1 hour. **Risk:** LOW (additive, fail-closed). **Compounds:** this list is now the single place to audit. Future security reviews check one file.

---

#### PHASE 3 — Collapse advisory hook theater

After the real gate is unified and complete (Phases 0+2), the 31 advisory hooks become safe to prune. They never blocked anything — they were compensating for the lack of a unified gate.

**Merge candidates (H2-verified):**
- `pre-tool-gate.js` → `pre-tool-use.js` (both PreToolUse advisories; one routes large reads, the other owns compaction tiers)
- Keep `bash-security-guard.js` and `yuri-risk-lite.js` SEPARATE (S2 finding #3 — they encode different denylists; two focused files beat one large one for audit clarity)

**Prune candidates (advisory-only, low-signal):**
- Evaluate whether the 31 advisory hooks should fire on every tool call. Many are telemetry/observability that could be sampled or moved to PostToolUse.

**Effort:** 2–3 hours. **Risk:** MEDIUM (must verify no advisory is actually load-bearing for a downstream system). **Compounds:** faster tool calls (fewer hooks), clearer "what actually enforces" picture.

---

#### PHASE 4 — Memory consolidation (the user-facing simplification)

After the structural plumbing is stable (Phases 0–3), consolidate the 320-file memory sprawl. This is the phase where Marcel's daily experience gets tangibly simpler.

**T1: Merge feedback rule families** (H4 finding):
- Dispatch family: 7+ files → 2–3 (reference `llm-compat-contract.mjs`)
- Fleet family: 9+ files → 3–4
- Commit/pathspec family: 3 → 1
- Research family: 4 → 2–3

**T2: Archive 8 parked/superseded entries** from MEMORY.md Active section.

**T3: Rewrite MEMORY.md** — cap Active at 40–50 entries, organize by rule family.

**Effort:** 4–6 hours (one focused session). **Risk:** LOW (reversible, tracked). **Compounds:** faster context loading, less staleness, cleaner subconscious recall.

---

#### PHASE 5 — Identity dedup (the token savings)

After memory is consolidated, surgically dedup the 3 identity files (H5 finding). NOT a merge — cross-references only.

**Key dedup moves:**
- "Adversarial ally" → keep in SOUL.md, cross-ref from yuri-origin + persona
- "Verification floor" → keep in yuri-origin, cross-ref from SOUL + persona
- "Protected paths + Mutation Contract" → keep in yuri-origin, cross-ref from SOUL + persona

**Effort:** 1–2 hours. **Risk:** LOW (zero structural risk, bidirectional x-refs). **Compounds:** ~40-token session-load reduction + cleaner authority hierarchy.

---

#### PHASE 6 — Safe autonomy (the power unlock)

After the gate is unified (Phase 0), the coverage is complete (Phase 2), and the hooks are honest (Phase 3), the system is ready for the overnight/autonomous surface that S1 finding #8 identifies as the systemic risk.

**Two options (S1 #8):**
- (a) Disable bash/write/applescript for voice brain in unattended mode; restrict to read-only + xref + remember
- (b) Add session-level cumulative-risk counter that escalates to confirm-gated when N routine-but-notable actions chain within one turn window

**Plus:** taint-tracking on untrusted tool output (S1 #2, Transfer 2 above) — treat `read_doc`/screenshot/`fetch_url` output as advisory in the tool_result framing.

**Effort:** 1–2 days. **Risk:** MEDIUM (new logic). **Compounds:** this is what unlocks "Marcel thinks and speaks and it gets done, overnight, safely."

---

### Why Phase 0 is the keystone (the compounding argument)

| If you do Phase 0 first... | What becomes trivial next |
|---|---|
| Voice brain routes through `evaluateToolCall` | Phase 2 = patch ONE list (not three) |
| One canonical gate function | Phase 3 = advisory hooks are obviously theater (real enforcement is one place) |
| Security findings #1, #2, #4 closed | Phase 6 = safe autonomy has a real gate to build on |
| One function to test | Regression coverage becomes one test suite, not three |

Phase 0 is the **corner-law move**: it's the action where the marginal effort is smallest AND the downstream enablement is largest. Every other phase's difficulty drops because the gate is in one place.

If you do Phase 0 LAST (after de-bloat, memory, identity), you've done all the cosmetic work while the security root cause persists. The cuts make the system look simpler; Phase 0 makes it BE simpler — one gate, one list, one test surface.

---

### Do NOT cut / Do NOT touch (the load-bearing core)

- `evaluateToolCall` in `yuri-safety-core.mjs` — the canonical gate function (becomes the spine)
- `bash-security-guard.js` + `yuri-risk-lite.js` — the two real Claude-code hooks (keep separate per S2 #3)
- `memory-kernel.mjs` (84 refs) + `memory-canonical-store.mjs` (36 refs) — the memory spine
- `llm-compat-contract.mjs` (1508 lines) — the canonical dispatch/lifecycle contract
- `codex-offload-runner.mjs` — S2 said dead, it's LIVE (4 callers)
- The 3 memory bridge/import/consolidator scripts — S2 confirmed non-overlapping seams
- The energy gate test infrastructure (30+ test files) — all load-bearing

---

### Lane assignment note

The run log shows `[MURE independence WARN] role 'adjudicator' declares independentOf 'synthesist' but both resolved to lane glm:glm-max` — meaning my synthesis and the adjudicator ran on the same model family. The adjudicator's verdict should be treated as sibling-adjacent, not fully independent. The corrections I've made (especially the `codex-offload-runner.mjs` liveness error) demonstrate the value of independent verification: S2's "CONFIRMED dead" was wrong, and only a grep trace caught it.

---

09SY_COMPOUNDING_ROADMAP_CUTS_HARNESS_LATTICE_P_PASS_COMMITTED

(Phase 0 is marked P because the *roadmap* is complete and evidence-grounded, but the keystone move itself is a BUILD recommendation — it needs owner approval for the MEDIUM-risk cross-language gate unification before execution.)