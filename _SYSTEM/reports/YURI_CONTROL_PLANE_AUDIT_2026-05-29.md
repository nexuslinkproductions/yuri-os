# YURI Control-Plane Audit & Capability State — 2026-05-29

> Where YURI is after a full ICM/MWP-grounded debug + upgrade pass on the control plane.
> Status of every change below is **local-evidence-verified** (tests run, exact output) or **explicitly deferred**.
> Authority: this is an operating-state record. Model-applied changes remain advisory until Codex/main verifies. Nothing was committed or pushed.

---

## 1. What YURI is

YURI is a single-operator AI control plane. Its architecture is grounded in **Jake Van Clief's ICM + MWP** (arXiv:2603.16021) with a YURI-specific dynamics layer on top:

- **ICM (Interpretable Context Methodology):** folder structure *is* the contract; the context layer (`context-registry.json` + `context-router.mjs`) selects a task packet before exploration; registries (`folder-registry`, `artifact-registry`) classify every durable surface; adapters are thin doors, policy lives once in `yuri-origin.md`.
- **MWP (Model Workspace Protocol):** the action surface is bounded by what the protocol *grants* (the PreToolUse hook chain + `bash-security-guard` deny layer + `isProtectedPath`), not by what is reachable.
- **YURI dynamics (its own contribution):** the energy gate `U(state)` with strict-descent `ΔU ≤ 0` (`math/yuri-energy.mjs`), the promotion ladder, claim-integrity, and the rule that model output is advisory until Codex/main + local evidence verify.

Routing is single-sourced in `_SYSTEM/Scripts/offload-contract.mjs` (lane table, scenarios, lifecycle); `_SYSTEM/Scripts/ai` is the dispatcher; `pulse-orchestrator.mjs` fans out the advisor ensemble; the LaunchAgent fleet runs scheduled/resident daemons.

---

## 2. Subsystem health (post-session)

| Subsystem | State | Notes |
|---|---|---|
| Offload / lane routing | **Strong** | Single-source contract; dead-lane gating fail-closed. Stale `nisaba-sentinel` pointer **fixed**. `comet` lane still a dead grant (backlog). |
| Memory (two-track) | **Healthy** | Track-B isolation enforced. `isProtectedPath` gap **closed** (now enforces all 15 surfaces). Promotion decision→file step still unwired (backlog). |
| Energy / claim dynamics | **By design** | Gate is observability-only (A.2.b enforcement roadmapped — left intact). `claim-integrity-gate` has no automated wiring (proposal). |
| Hook chain (MWP) | **Improved** | `route-plan` false-fire **fixed**; `yuri-risk-lite` (was the dead `cassandra-lite` no-op) **now enforces** mkfs/raw-disk/DROP DATABASE + advises the rest. |
| Context / registries (ICM) | **Excellent** | 0 packet drift. `folder-census --validate` permanently-red gate still open (backlog). Protected-path policy still duplicated 5 ways (backlog). |
| LaunchAgent fleet | **Mixed** | `launch-readiness-nightly` (exit 127) and `lane-memory-prune` (exit 78) still broken; orphan `com.nudimmud.token-digest` still loaded (proposals). Orphan in-repo nisaba plist **archived**. |
| Legacy-name hygiene | **Mostly clean** | HERMES removed; cassandra→yuri-risk; nudimmud purged from live prose/wiring (log-dir migration deferred). |
| Adapters / skills | **Good** | 7 safety skills symlink-enforced. 22 drifted `.claude/skills` copies still open (backlog). |

---

## 3. Changes applied this session (verified)

1. **Sentinel log rotated** — `_SYSTEM/Logs/yuri-sentinel.log` 5,971 → 41 lines; full history archived. Root-caused the `cjs/loader:1478` `MODULE_NOT_FOUND` as 9-day-stale residue (already fixed by the script relocation); confirmed today's cycles `exit=0`.

2. **Wave-1 security + symbiosis hook fixes** (verified: lane-kernel 10/10, protocol-guard 1/0):
   - `lane-kernel.isProtectedPath` now **derives from the frozen `PROTECTED_SURFACE_PREFIXES`** — closed a real gap where credentials / lane-sessions / paste-cache / history.jsonl were declared protected but silently unguarded (8 of 15 enforced → all 15).
   - `claude-protocol-guard` `missing-route-plan-evidence` **no longer false-fires** on doc writes / TodoWrite (scan scoped to command/path/prompt surface, not prose). Verified across 5 tool shapes.
   - Dangling `memory/feedback_no_anthropic_agents.md` ref → canonical `_SYSTEM/memory/...` in agent-spawn-guard + protocol-guard.

3. **Broken-path bug-fixes** (verified: offload-contract regression 1/0): `offload-contract` sentinel path/label (`nisaba-sentinel.mjs`/`com.yuri.nisaba-sentinel` → real `yuri-sentinel.mjs`/loaded label); `memory-bus.js` watcher regex + `brain-inject.js` repointed off the dead `.claude/nisaba/` path to live `.claude/yuri-sentinel/`.

4. **HERMES removed entirely** (owner-directed; verified green: 3 suites). The scout + forecast advisor (`dispatchHermesForecast`/`HERMES_FC`/`hermes-forecast` slot) cut from 13 files + tests + manifest + registry + EOT skill; spec archived (`_SYSTEM/archive/legacy-purge-2026-05/hermes-scout-spec.md`). Route-plan ensemble confirmed clean.

5. **cassandra → yuri-risk** (verified green: offload-contract + scout-runner + protocol-guard, all 1/0). Advisor source `CASSANDRA→YURI_RISK`, slot `cassandra→yuri-risk`, scout token `CASSANDRA→YURI-RISK`, graph node, manifest, agent doc. The hook `cassandra-lite.js → yuri-risk-lite.js` was **given the executor it never had** (it was wired into PreToolUse as a no-op) — now denies catastrophic Bash (mkfs / raw-disk / DROP DATABASE) and advises the rest; **fired live** in-session on an `rm -rf` mention. This rename also **fixed a pre-existing red test** (`scout-runner.dispatch`) by pointing the scout at the existing `yuri-risk.md`.

6. **nudimmud purge (non-deferred)** — skill description + body + README/impl-plan prose (35 lines across 23 files, excluding ABSORBED-FROM provenance + dated Session-Notes), sharingan live-write path (`/Users/marcelspatz/NUDIMMUD/.sharingan/` → `…/YURI-OS-MUSUBI/…`), `INDEX.md` wording, `package-lock.json` name, `.gitignore` (nisaba paths repointed, dead nudimmud negations retired), `self-audit` allowlist, `design-memory` note. Archived 3 dead docs (`09OC-CONTINUOUS-PROMPT.md`, `AGENTS/OPENCLAW.md`, orphan nisaba plist). **Kept** the deliberate `NUDIMMUD` forbidden-snippet guard in `claude-plugin-parity-check.mjs` (it enforces the purge).

---

## 4. Symbiosis improvements

- **Less false friction:** the `route-plan-evidence` gate stopped firing on planning/doc tools — the gate now signals only on genuine routing/dispatch action surfaces. A gate that lives, not one that nags.
- **Real enforcement where there was a no-op:** the destructive-command guard (`yuri-risk-lite`) now actually bounds the action surface (MWP), instead of being wired-but-inert.
- **Stronger protected-surface boundary:** credentials/session-state surfaces are now genuinely guarded (single-source derivation, can't drift out of enforcement).
- **Cleaner ICM legibility:** dead pointers and legacy codenames removed from the live tree so structure reflects reality.

---

## 5. Deferred — needs explicit owner go (high blast radius)

1. **openclaw codename rename** — coupled to a persisted DB identifier (`schema.sql` `agents.agent_id='OPENCLAW'`, FK-referenced, live rows in `memory.db`) and the external gateway (port 18789). The pulse-advisor source string is renameable in-memory, but the bridge/npm/swarm-handoff are DB-coupled. Needs a coordinated DB migration.
2. **NISABA deity DB row + `NISABA/` vault path-prefix** — a live data/API/ingestion contract read by 6 backend services + a test + the public `/deities` API + the on-disk vault folder. Precedent: NABU's subsystem was archived but its deity DB row was kept. **Do not** fold this into a string rename.
3. **LaunchAgent log-dir migration** — 3 shell scripts + ~15 plists still write to `~/Library/Logs/NUDIMMUD`. Must be edited + `launchctl` reloaded in lockstep (live daemons); reloading mid-session is a live-system mutation. Edit-the-files is ready; the reload is your call.
4. **nisaba const-symbol cosmetic renames** (9 scripts: `NISABA_DIR` → `YURI_SENTINEL_DIR` etc.) — internal symbol names only; the path *values* already resolve to `.claude/yuri-sentinel/`, so this is zero-functional-impact cosmetics.

---

## 6. Open backlog (found in cartography, not yet fixed)

- **Broken daemons:** `launch-readiness-nightly` → missing wrapper (exit 127); `lane-memory-prune` → missing interpreter + script (exit 78); orphan `com.nudimmud.token-digest` loaded against the retired `/Users/marcelspatz/NUDIMMUD` root.
- **`folder-census --validate`** is permanently red (no tombstone exemption) — a gate that can never pass gets ignored. One-line fix mirrors `artifact-registry`.
- **Protected-path policy duplicated 5 ways** with 4 divergent contents (`yuri-origin`, `context-registry`, `artifact-registry`, `folder-census`, `claude-protocol-guard`) — single-source it.
- **`.claude/skills` drift:** 22 of 54 are copies that diverged from canonical `skills/` (only 7 safety skills are symlink-enforced).
- **`claim-integrity-gate`** is enforcement-capable but wired into no hook/CI.
- **`comet` lane** granted by the contract with no executor (dead route).
- **energy-landscape context packet** omits 4 paper-critical scripts that exist + are artifact-registered.

---

## 7. Residual risks

- No browser/daemon runtime re-verification was performed for the LaunchAgent items (file-level only); the reloads remain owner-gated.
- The energy gate is **observability-only by design** — do not describe it as "enforcing" anywhere (matches the paper's honest-limitations section).
- `audit-output/test-report.json` still shows `cassandra` — it's a generated cache, refreshes on next audit run.
- Changes are uncommitted working-tree edits — reversible, pending Codex/main verification.

---

RESULT_LABEL: `00CP_YURI_CONTROL_PLANE_DEBUG_LEGACY_PURGE_HERMES_REMOVE_CASSANDRA_RENAME_P_PASS_UNCOMMITTED`
