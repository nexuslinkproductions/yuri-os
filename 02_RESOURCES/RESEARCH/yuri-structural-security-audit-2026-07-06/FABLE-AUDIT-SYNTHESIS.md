# FABLE-5 MASTERMIND SYNTHESIS — YURI Structural + Security Audit

**Date:** 2026-07-06 · **Auditor:** Fable-5 (high reasoning), single mastermind pass over a 4-substrate prep fan-out
**Repo:** `/Users/marcelspatz/YURI-OS-MUSUBI` (branch `main`) · **Operator:** Marcel
**Method:** Read all 15 lane outputs, then **re-verified every load-bearing claim directly against code** (grep for live callers across `.mjs`/`.js`/`.cjs`/`.sh`, direct file reads of the three denylists, `settings.json` hook parse, file-existence tests). This is a RULING, not a mutation — nothing here was executed. Every cut below is code-verified against MY OWN reads, or it is in NEEDS-VERIFICATION.

**The one meta-signal that governed this pass:** the inventory lanes registry-*guessed* dead code, and the deepest analysis lane (S2) then trusted one of those guesses and got it wrong. I trust NO "dead" verdict I did not re-grep myself. Two of the three "confirmed-dead" scripts in the prep are LIVE. See §6.

---

## 0. WHAT I VERIFIED AGAINST CODE (the evidence floor)

| Claim under test | Prep verdict | **My code check** | **My ruling** |
|---|---|---|---|
| `codex-offload-runner.mjs` dead | S2: "CONFIRMED dead" | ~8 live callers: `yuri-sandbox-loop.mjs:21`, `llm-compat.sh` (6 exec sites: 306/309/312/417/421/425 — the real codex dispatch path), `memory-proposal-autopilot.mjs:25`, `worker-bridge.mjs:34`, `task-queue.mjs:34`, `ai:683`; named in `llm-compat-contract.mjs:315`. **No retirement marker in the file.** | **LIVE — DO NOT CUT** |
| `pulse-lane-dispatch.mjs` dead | S2/H1: "CONFIRMED dead, retired 2026-05-29" | `llm-compat.sh:51` `exec node …/pulse-lane-dispatch.mjs "$@"` for `complex`/`critical` tier. The "retired 2026-05-29" comments (lines 7, 87) scope ONLY to `const mem = ''` (palace retrieval), not the dispatch wrapper. | **LIVE — DO NOT CUT** |
| `lane-dispatcher.mjs` dead | S2/MURE: dead orphan | Zero live callers repo-wide. Refs are: 2026-05-16 audit-archive plan docs, auto-gen `yuri-knowledge-graph.json`, a SELF-IMPROVEMENT doc's unrealized "Packet 15", and THIS audit's own shadow-ledger echo. Reads `lane-capability-manifest.json` as an unwired capability scorer. | **DEAD — SAFE TO ARCHIVE** |
| `nisaba-sentinel.mjs`, `gate-rerank.mjs`, `multi-horizon-gate.mjs` | H1 named as cut candidates | `test -f` → **all ABSENT.** Files do not exist. | Not cuttable — nothing there |
| `spreading-activation-gate.mjs` LIVE | S2: LIVE | Zero `.mjs`/`.js` importers. S2's evidence was graph-state auto-inclusion + its own shadow-ledger claim. | **NEEDS-VERIFICATION** (not live-proven) |
| `train-fleet-router-from-ledger.mjs` | H1: maybe superseded | LIVE — `await import` in `fleet-mlp-feedback.mjs:352`, exported-for by `fleet-router-mlp.mjs`, run by `runFleet.mjs`. DISARMED-gated (`YURI_MLP_LEARN`). | **LIVE — KEEP** |
| 3 memory bridge scripts redundant | H1: maybe redundant | Three distinct seams, distinct callers (verified §3B). | **KEEP all 3** |
| `read_doc` reads absolute paths | S1 #4 | `yuri-z-brain.py:910` `full = p if os.path.isabs(p) else os.path.join(REPO, p)` | CONFIRMED |
| `screen-context /act` wired to voice | main-session claim | NOT in the TOOLS array (`bash`/`read_file`/`write_file`/`read_doc` present; no `act`/`screen-context`/`click_menu`). | CONFIRMED NOT WIRED (future risk only) |
| `ast-bash.mjs` wired to live bash gate | G1 divergent claim | Only `corpus-security-scan.mjs:43` imports it (static skill-file scan). Live `bash-security-guard.js` is pure regex. | CONFIRMED split-brain gap |
| 3 drifted protected-path denylists | S1/S2/MURE | All three read directly — drift confirmed (§1). | CONFIRMED |
| Hook reality | H2/G1/perf | 13 PreToolUse entries, **9 fire on every call**; deny-emitters: bash-security-guard, yuri-risk-lite, math-register (Write\|Edit), energy-enforce (DISARMED), claude-protocol-guard (deny path exists but needs `CLAUDE_SESSION_ID`, else WARN). | CONFIRMED |
| Memory Track-B file count | H4: 320 | `find` → **322** | CONFIRMED |
| tdd + test-driven-development both exist | H3 | Both dirs exist (113 vs 375 lines) | CONFIRMED (dedup, not blind cut) |
| cgs-mold alias broken | H3 | `.claude/commands/cgs-mold.md` MISSING | CONFIRMED |

---

## 1. SECURITY HARDENING RULING (priority-1, actionable now)

**The shape of the whole security problem in one sentence:** YURI has THREE independently hand-maintained protected-path denylists that have already drifted apart, and the one guarding the voice brain runs entirely outside the Claude Code hook chain — so the real enforcement surface is fragmented, and the fragment that guards a live untrusted-content ingestion path (`read_doc`) is the weakest and narrowest of the three.

**The three denylists, read directly from code:**

| Surface | Location | Coverage | Gaps (verified by direct read) |
|---|---|---|---|
| Claude Code hook | `.claude/hooks/bash-security-guard.js` (1181 lines) | `.env`, `.claude/*` protected, credentials, settings.json writes, role-gated mutations | Pure regex token-match; `ast-bash.mjs` analyzer NOT wired here (only to static corpus scan) |
| Fleet lanes | `_SYSTEM/Scripts/policy/yuri-safety-core.mjs` `PROTECTED_TARGETS`/`PROTECTED_LITERAL_PATTERNS` | `.env`, `.claude/{state,history,file-history,projects}`, `.amp`, `backend/data`, `node_modules` — all `PROJECT_ROOT`-relative | **MISSING `.git/` (hooks/config) → `.git/hooks/pre-commit` persistence path; MISSING `~/.claude/` outside repo** |
| Voice brain | `yuri-z-brain.py:296` inline `PROTECTED` tuple (12 substrings) | `.env`, `backend/data/`, `.claude/{state,history,file-history,projects}/`, `node_modules/`, `.amp/`, `id_rsa`, `.ssh/`, `credentials`, `secret` | **MISSING `~/.aws`, `~/.npmrc`, `~/.docker`, `~/.gitconfig`, `~/.zsh_history`, macOS Keychain; runs OUTSIDE the Claude Code hook chain entirely** |

**Ranked findings (CRIT/HIGH/MED · confirmed vs plausible):**

| # | Sev | Confidence | Finding | Minimal fix |
|---|-----|-----------|---------|-------------|
| SEC-1 | **CRIT** | CONFIRMED | Voice brain (`yuri-z-brain.py`, standalone HTTP server) executes `bash`/`write_file`/`edit_file` with ONLY its own 12-token regex tuple as the gate. The 3 real Claude Code blocking hooks NEVER see this surface. | Route the brain's `_exec_tool` bash/write/edit dispatch through the SAME `evaluateToolCall` (`yuri-safety-core.mjs`) via a subprocess/HTTP shim. One canonical gate, not three. |
| SEC-2 | **CRIT** | CONFIRMED mechanism / PLAUSIBLE exploit | Confirm-gate (`_is_critical_call`) classifies by regex over the agent's OWN command string, not by whether **untrusted content** (`read_doc` PDF text — a LIVE, reachable tool) drove the command. Indirect-prompt-injection → critical action that misses the regex just runs. | Taint the pipe: mark `read_doc`/`fetch_url`/(future) screen output UNTRUSTED; escalate the next critical-adjacent tool call in that window to confirm-gated regardless of syntax. |
| SEC-3 | **HIGH** | CONFIRMED | `write_file` is ROUTINE for brand-new files — `_is_critical_call` gates it ONLY if `os.path.exists()`. A new `~/.ssh/authorized_keys`, LaunchAgent plist, or shell-rc snippet writes with zero confirm. | Gate `write_file` CRITICAL when target is outside repo root OR under a sensitive-new-file denylist (`~/.ssh/`, `~/Library/LaunchAgents/`, shell rc, cron), not only on overwrite. |
| SEC-4 | **HIGH** | CONFIRMED | Fleet gate `PROTECTED_TARGETS` missing `.git/hooks`, `.git/config`, out-of-repo `~/.claude/`. A poisoned fleet lane writing `.git/hooks/pre-commit` = persistence that fires on the next commit by any lane incl. the owner's. | Add `.git/hooks`, `.git/config`, `~/.claude/settings*.json` to `PROTECTED_TARGETS` (once the gate is unified, this is ONE list to patch). |
| SEC-5 | **HIGH** | CONFIRMED (systemic) | Overnight/unattended mode has the SAME tool access + SAME regex gates as attended, but loses the human spoken-confirm backstop AND has no session-level cumulative-risk aggregation — every classification in `yuri-z-brain.py` is per-call, stateless. Multi-step chains (new file → chmod +x → LaunchAgent) reach persistence with zero single gated step. | Unattended = strictly reduced-capability profile (read/xref/remember, no bash/write/applescript by default) OR a session-level cumulative-risk counter that escalates after N routine-but-notable actions chain. |
| SEC-6 | **MED** | CONFIRMED | `ast-bash.mjs` (the deeper analyzer) guards only STATIC skill files (`corpus-security-scan.mjs`); LIVE commands from the model get the shallower pure-regex `bash-security-guard.js`. Two threat models, live path weaker. | Either wire `ast-bash` into the live gate or delete it (a security tool that isn't enforced is false assurance). Lower priority than SEC-1–5. |
| SEC-7 | **MED (packet claim ≠ code)** | CONFIRMED | `screen-context /act` is NOT wired to voice-Yuri (not in TOOLS array). This is FUTURE risk, not live. The main session over-claimed it as live. | Before wiring `/act`: frame AX-tree text as DATA-not-COMMAND in tool_result; harden `escApple` beyond quote-balancing. Track as a gate for the wiring PR, do not treat as a live hole today. |

**Owner-context caveat that adjusts severity honestly (not a downgrade of the fix):** the voice-brain code carries an explicit owner comment (`yuri-z-brain.py:294`) — *"Not adversary-proof (Marcel's voice drives it, not an attacker) — it stops the misheard/model catastrophe."* Marcel's stated threat model for the voice brain is **misfire safety**, not anti-adversary. That is coherent WHILE the brain's only inputs are Marcel's voice. The moment untrusted content enters its context (`read_doc` on a crafted PDF today; screen-context tomorrow), SEC-2 flips from theoretical to real — which is exactly why the taint fix (SEC-2) and the unified gate (SEC-1) matter even under the owner's own framing. I am not overriding the owner's model; I am marking the precise condition under which it stops holding.

### The 3 highest-leverage security moves (do first, in this order)

1. **SEC-1 — Collapse to ONE gate.** Route `yuri-z-brain.py`'s bash/write/edit through `evaluateToolCall`. This is the keystone: it closes SEC-1 outright and makes SEC-2/SEC-3/SEC-4 a patch to ONE list instead of three. Highest leverage because it is a security fix AND a maintenance-burden fix AND the root of the compounding roadmap (§4). MEDIUM risk (cross-language shim), HIGH reversibility (revert to inline regex).
2. **SEC-4 — Patch the unified list's coverage.** Add `.git/hooks`, `.git/config`, out-of-repo `~/.claude/`, and the dotfile credential stores (`~/.aws`, `~/.npmrc`, `~/.docker`, `~/.gitconfig`, keychain) to `PROTECTED_TARGETS`; extend the `write_file` gate to sensitive-new-file paths (SEC-3). LOW risk (additive, fail-closed). After SEC-1 this is one file.
3. **SEC-5 — Make unattended structurally safer than attended.** Ship the reduced-capability unattended profile + session-level cumulative-risk counter. This is the gate that must exist BEFORE the overnight autonomy Marcel wants. MEDIUM risk (new logic).

**Arming note (Self-Governance Charter):** SEC-1/3/4/5 are BUILDS behind existing gate surfaces — building them is self-governable, but *arming* (making the unified gate the live enforcement path, or arming the unattended profile) is owner-gated. Present the finished build + a one-token confirm to arm.

---

## 2. DE-BLOAT CUT LIST (code-verified) + NEEDS-VERIFICATION

### CONFIRMED-DEAD — SAFE TO ARCHIVE (I re-grepped each; zero live callers)

| Path | Why dead (evidence I verified) | Removal risk |
|---|---|---|
| `_SYSTEM/Scripts/lane-dispatcher.mjs` | Zero live importers/execs repo-wide. Only refs: 2026-05-16 audit-archive plan docs, auto-gen knowledge-graph state, an unrealized SELF-IMPROVEMENT "Packet 15", this audit's own shadow-ledger echo. A capability scorer over `lane-capability-manifest.json` never wired into live dispatch. Distinct from (not a duplicate of) `lane-dispatch.mjs`. | **LOW** — pure archive, zero callers. Also clean the dead `nisaba-sentinel-native` role string in `llm-compat-contract.mjs:986` while here (references a script that no longer exists). |

**That is the ENTIRE confirmed-dead script cut list: ONE file.** This is the honest number. The prep proposed three; two of the three (`codex-offload-runner`, `pulse-lane-dispatch`) are LIVE and cutting either would break real dispatch paths. I will not pad the cut list to look productive — a wrong cut here is the expensive failure the brief named.

### NEEDS-VERIFICATION (do NOT cut without the specific trace named)

| Candidate | Why unresolved | The trace that would settle it |
|---|---|---|
| `spreading-activation-gate.mjs` | Zero `.mjs`/`.js` importers; S2's "LIVE" rested on graph-state auto-inclusion (lists ALL scripts) + its own shadow-ledger claim. Likely a roadmap-organ prototype never wired. | Trace whether any live energy-session run actually invokes it (vs `spreading-activation-memory.mjs`, which IS live via `yuri-knowledge-graph.mjs`). If no live invocation → archive. |
| `tdd` vs `test-driven-development` skills | Both dirs exist (113 vs 375 lines), same topic, distinct `name:` frontmatter. A blind delete could break whichever the router prefers. | Content-diff; pick the canonical (recommend `test-driven-development` as the fuller superpowers skill), redirect/retire `tdd`, update any `commands/` alias. This is a merge decision, not a cut. |
| `pre-tool-gate.js` → `pre-tool-use.js` merge | Both PreToolUse advisories, never block; H2/MURE flag as low-value merge. No shared code path confirmed. | Read both fully; confirm the DeepSeek-routing logic in `pre-tool-gate` has no live consumer before folding. |
| `haki-intent` / `hatch-pet` skill status | H3 uncertain; not traced this pass. | Grep for tombstone marker + last-invocation signal before any action. |

**DO-NOT-CUT correction to the prep (these were flagged, they are LIVE):** `codex-offload-runner.mjs`, `pulse-lane-dispatch.mjs`, `nano-compact-gate.mjs`, `spreading-activation-memory.mjs`, `train-fleet-router-from-ledger.mjs`, all 3 memory bridges. See §6.

---

## 3. HOOK/PERF TRIM + MEMORY CONSOLIDATION

### 3A. Hook / per-call tax

**Verified reality:** 13 PreToolUse entries, **9 fire on every tool call** (`*` matcher). Real deny-capable: `bash-security-guard` + `yuri-risk-lite` (universal, always-armed) + `math-register-guard` (Write\|Edit only) + `energy-enforce` (DISARMED) + `claude-protocol-guard` (deny path exists but requires `CLAUDE_SESSION_ID`, else degrades to WARN — so unreliable as a universal blocker). The other ~6 universal PreToolUse hooks (`pre-tool-gate`, `pre-tool-use`, `tirith-url-guard`, `musubi-protocol-enforce`, `directive-guard`, plus `filing-gate` on writes) are advisory-only — each self-documents "NEVER blocks."

**Ruling — this is the highest-ROI perf win in the whole audit, and it is safe BECAUSE nothing advisory enforces anything:**

1. **Narrow the 3 real Bash-only gates to a `Bash` matcher:** `yuri-risk-lite.js` and `tirith-url-guard.js` both early-exit on non-Bash but still pay the ~67ms Node spawn on every Read/Grep/Glob. Matcher-gate them to `Bash`. (Keep `bash-security-guard` universal — it also guards Read of protected files.)
2. **Cut 3 pure-advisory always-on hooks** (they inject text the model already has from CLAUDE.md/memory): `musubi-protocol-enforce.js` (60s-throttled aeonic nudge), `directive-guard.mjs` (287 lines re-parsing 4 YAML files per call for a reminder), `agent-spawn-guard.js` (observability-only, Agent-matched). Net: ~195ms/call saved.
3. **Merge `pre-tool-gate.js` → `pre-tool-use.js`** (both advisory; NEEDS-VERIFICATION on the routing logic, §2). Saves one spawn.
4. **KEEP separate:** `bash-security-guard.js` and `yuri-risk-lite.js` — different denylists (path-protection vs destructive-pattern); two focused files beat one 1400-line file for audit clarity. This is the one place MORE separation is correct.
5. **KEEP `energy-enforce.mjs`** even disarmed — cheap pass-through, and it is the armed circuit-breaker path.

**Expected result:** Read/Grep/Glob per-call tax drops from ~650ms toward ~150ms (only `bash-security-guard` + `pre-tool-use` + `energy-enforce` universal), zero enforcement capability lost. Order this AFTER §4 Phase 0 so "what actually enforces" is already collapsed to one place and the advisory cuts are obviously safe.

### 3B. Memory consolidation (~322 Track-B files)

Verified 322 `.md` files. This is a **content-hygiene problem, not a script problem** — S2/MURE confirmed ZERO script-level redundancy in the memory-writer layer (the 3 bridges are distinct seams: `memory-kernel-canonical-bridge` = ledger→canonical governed sync; `yuri-canonical-memory-import` = cold-path run-artifact import/rollback into `memory.db`; `kagami-memory-consolidator` = daily Qwen local-model audit/flag over Track-B `.md`). Plan:

1. **Merge feedback rule families** (H4's dup families, verified as basename clusters): commit/pathspec 3→1, dispatch 7+→2-3 (reference `llm-compat-contract.mjs`), fleet/agent 9+→3-4, research 4→2-3. Net ~23-35 files → ~8-10 canonical rules. Cross-link by handle, don't mirror.
2. **Archive 8 parked/superseded entries** out of MEMORY.md's Active section (infra-gate-posture stress test, nexus-link/nexus-motion/local-slm/yeganeh parked projects, retired-graphify-palace, offload-consolidation superseded).
3. **Cap MEMORY.md Active at ~40-50 entries**, organize by rule family (it is over its injection cap now).
4. **The leverage play (higher than any merge):** `kagami-memory-consolidator.mjs` ALREADY runs daily and computes exactly this dup/staleness flagging into `memory-health.json` — but its output is not consumed. **Wire its flags into an owner-reviewed merge queue.** The detection mechanism exists; close the loop instead of doing the dedup by hand every quarter.

Risk: LOW (reversible, git-tracked). Effort: one 4-6h owner-adjacent session. Do NOT auto-archive without owner review (irreversible-ish for recall).

### 3C. Identity + skills (do NOT over-cut)

- **Identity spine:** KEEP the 3-file separation (`yuri-origin.md` = authority, `SOUL.md` = cognition, `persona.md` = Marcel-private behavior). H5 found 15 overlaps, ZERO contradictions; each file carries irreplaceable distinct value (authority hierarchy / cognitive-workflow pedagogy / Rick-private + 5-state router). Do only the surgical dedup: keep each duplicated concept in its canonical home, replace the copies with a one-line cross-ref. Net ~40 tokens/session, zero structural risk.
- **Skills:** Fix `cgs-mold` broken alias (create `.claude/commands/cgs-mold.md` or drop the trigger). Resolve `tdd`/`test-driven-development` (§2 NEEDS-VERIFICATION). Everything else is coherent — 7 clean subsystems, no bloat crisis. Do not cut the cognitive-framework skills into SOUL.md (a divergent lane proposed this; the file IS the invocable surface — folding it into prose loses the Skill-tool routing).

---

## 4. THE COMPOUNDING ROADMAP (sequenced, security-first)

Each phase makes the next cheaper. Security root-cause first, cosmetic last — because cleaning scripts while three denylists drift makes the system *look* simpler without *being* simpler.

**PHASE 0 — THE SINGLE HIGHEST-LEVERAGE FIRST MOVE: unify the voice-brain gate onto `evaluateToolCall` (SEC-1).**
Why this is the keystone and not the memory cleanup: it is the one change where marginal effort is smallest and downstream enablement is largest. It closes SEC-1 (CRIT) outright; it turns SEC-2/3/4 from "coordinate a fix across 3 drifting lists" into "patch ONE list"; it makes the Phase-2 hook cuts provably safe because real enforcement now lives in one testable place; and it is the precondition for the safe-autonomy Marcel actually wants. Every later phase's difficulty drops because the gate is in one place. Ship the smallest version: a subprocess/HTTP call from `_exec_tool` to `yuri-safety-core.mjs --check` before bash/write/edit, with the brain's spoken AFFIRM/NEGATE UX layered on top of the shared allow/deny primitive. MEDIUM risk, HIGH reversibility. *(Arming the unified gate as the live path is owner-gated; building it is self-governable.)*

**PHASE 1 — the one safe cut (warmup, builds momentum):** archive `lane-dispatcher.mjs` + clean the dead `nisaba-sentinel-native` role string. 10 min, LOW risk. Reduces surface, clarifies dispatch topology for later.

**PHASE 2 — patch the now-single denylist (SEC-3/SEC-4):** add `.git/hooks`, `.git/config`, out-of-repo `~/.claude/`, dotfile credential stores; extend `write_file` gate to sensitive-new-file paths. 1h, LOW risk. After Phase 0 this is ONE file, and it is now the single place future security reviews audit.

**PHASE 3 — collapse advisory hook theater (§3A):** narrow `yuri-risk-lite`/`tirith` to `Bash`; cut `musubi-protocol-enforce`/`directive-guard`/`agent-spawn-guard`; merge `pre-tool-gate`→`pre-tool-use`. Safe now because Phase 0+2 proved real enforcement is in one place. 2-3h, ~500ms/call saved on reads.

**PHASE 4 — memory consolidation (§3B):** the phase where Marcel's daily experience gets tangibly lighter. 4-6h. Wire the kagami consolidator loop as the durable mechanism so this never re-accretes.

**PHASE 5 — identity dedup (§3C):** surgical cross-refs only. 1-2h, LOW risk, ~40 tokens/session.

**PHASE 6 — safe autonomy (SEC-5 + SEC-2 taint):** the power unlock. Reduced-capability unattended profile + session-level cumulative-risk counter + taint-tracking on `read_doc`/`fetch_url` output. This is what makes "Marcel thinks and speaks and it gets done, overnight, safely" real — and it is only safe to build ONTO the unified, coverage-complete gate from Phases 0/2. 1-2 days.

**Why the order is load-bearing:** if Phase 0 is done LAST, every cut above it is cosmetic while the CRIT security root persists. Phase 0 first means the cuts land on a system that is already structurally simpler, not just tidier.

---

## 5. DO-NOT-CUT — the load-bearing core

- **`evaluateToolCall` in `yuri-safety-core.mjs`** — becomes the single security spine. Protect and extend, never fragment further.
- **`bash-security-guard.js` + `yuri-risk-lite.js`** — the two real universal Claude Code blockers. Keep SEPARATE. Improve, don't merge.
- **`math-register-guard.mjs`** — real fail-closed Write\|Edit gate.
- **`llm-compat-contract.mjs` (1508 lines) + `lane-dispatch.mjs` + `llm-lane.mjs`** — the dispatch contract + two engines.
- **`llm-compat.sh` + `pulse-lane-dispatch.mjs` + `codex-offload-runner.mjs`** — the LIVE tier-gated + codex dispatch paths. **These are the two the prep wrongly marked dead. Cutting either breaks real routing.**
- **`memory-kernel.mjs` + `memory-canonical-store.mjs` + all 3 bridge/import/consolidator scripts** — 3 distinct non-overlapping seams.
- **`nano-dispatch*` + `nano-compact-gate.mjs` + `spreading-activation-memory.mjs`** — live nano-swarm/knowledge-graph plumbing.
- **`glm-fleet.mjs` / `ollama-fleet.mjs` / `cline-fleet.mjs`** — distinct model families, distinct auth/API; NOT redundant with each other.
- **`train-fleet-router-from-ledger.mjs`** — live (DISARMED-gated) fleet-MLP path.
- **The 3-file identity spine** as 3 files. **The energy-gate test infrastructure** (30+ test files).

Where cutting risks silent breakage: any script exec'd from `.sh` (the prep's `.mjs`-only greps missed `llm-compat.sh` — this is how BOTH false-positives happened); anything referenced dynamically via `await import()` (e.g. `train-fleet-router`); the 4 registries behind a facade before migrating all importers.

---

## 6. VERDICT ON THE PREP

**What the prep got right (build on it):** the 3-denylist drift finding is real and code-confirmed by three independent lanes + me — it is genuinely the single highest-leverage move (security fix + maintenance fix + roadmap keystone in one). The hook advisory-vs-enforcement classification is accurate. The identity/skills "do not over-cut" conclusion is correct. The `lane-dispatcher.mjs` orphan call is correct. The non-existence of `gate-rerank`/`multi-horizon-gate` is correct. S2's catch of H1's memory-bridge and isolated-gate false-positives was the most valuable single act in the prep.

**Where the prep over-reached / was wrong (I discounted these):**
- **S2's "CONFIRMED dead" on `codex-offload-runner.mjs` and `pulse-lane-dispatch.mjs` is FALSE.** Both are LIVE. S2 trusted H1's comment-reading instead of re-grepping, and both lanes grepped `.mjs`/`.js` only — missing the `.sh` callers and the "retired" comment that scoped to a *feature*, not the *script*. The MURE adjudicator caught this independently; I confirmed it in code. **This is the meta-lesson of the whole audit: shell-caller blindness + comment-trusting is how a good analyst ships a wrong cut.** It is exactly why the confirmed-dead cut list is ONE file, not three.
- **S2 over-claimed `spreading-activation-gate.mjs` LIVE** on graph-state auto-inclusion (graph lists all scripts, not just live ones). Downgraded to NEEDS-VERIFICATION.
- **The main session over-claimed `screen-context /act` as a live voice tool** (S1 caught it; I confirmed it's absent from the TOOLS array). Real future risk, not a live hole — do not let it inflate today's severity.
- **A divergent GLM lane proposed cutting scripts 826→<50 and folding cognitive-framework skills into SOUL.md.** I discounted the aggressive mass-cut (unverified, exactly the failure mode the brief warns against) but ADOPTED its two verified structural insights: the `ast-bash` split-brain gap (SEC-6) and the "one enforceable boundary beats inventory management" framing (which is Phase 0). Its call to delete skills wholesale is wrong — the file is the invocable surface.

**Net:** the prep is a strong evidence map with one dangerous class of error (registry-guessed liveness) that the adversarial lanes and this pass caught. Trust its denylist-drift finding and its "don't over-cut identity/skills/memory-scripts" conclusion; distrust every raw "dead" verdict not re-grepped against `.sh` + dynamic-import callers.

---

## RESULT_LABEL
`09FB_YURI_SECURITY_STRUCTURE_MASTERMIND_RULING_X_PASS_COMMITTED`
