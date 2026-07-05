Confirmed. The `ast-bash.mjs` "AST parser" is also regex-based (it's a tokenizer + regex sink matcher), and critically **it is NOT wired into the live bash-security-guard hook** — it's only used by `corpus-security-scan.mjs` (a static scan over skill files, not live command execution). The live gate is pure regex token-splitting. This is the single most important security finding.

I have everything I need. Here is my ruling.

---

# CUT TO CORE, HARDEN THE AGENT — a blind architect's ruling

## Ground truth I verified (not from the brief, from code)

| Claim | Evidence |
|---|---|
| 826 script files in `_SYSTEM/Scripts`, **571 flat in root** (no namespace) | `find` count |
| PreToolUse stack has **9+ hooks**; only **4 actually emit `permissionDecision: 'deny'`**: `bash-security-guard`, `yuri-risk-lite`, `claude-protocol-guard`, `energy-enforce` (math-register-guard denies on Write/Edit only) | `grep permissionDecision` per hook |
| Every other hook is **advisory-only** (`process.exit(0)`) | exhaustively grepped |
| The live bash gate is **pure regex token-splitting** (`toks()`/`unquote()`/`normTok()` + regex on command strings) — NOT a parser, NOT sandboxed | read `bash-security-guard.js` lines 1-400 |
| A real bash "AST analyzer" (`ast-bash.mjs`, 192 lines) exists but is **NOT wired into the live gate** — only used by static corpus scan | `grep ast-bash` call sites = `corpus-security-scan.mjs` only |
| **Zero sandbox primitives** anywhere: no seccomp, no bubblewrap, no namespace, no firejail, no setrlimit, no AppArmor | `grep -r` for all of them = 0 real hits |
| `Bash(*)` is in `permissions.allow` — every bash command pre-approved; the regex hook is the ONLY thing between the model and the shell | `.claude/settings.json` |
| 8,893 markdown files across `_SYSTEM`; 323 memory files in `.claude/memory` alone | `find` count |
| 118 skills with `SKILL.md`, 530-line `skill-index.json` | verified |
| Identity layer: SOUL(92) + yuri-origin(192) + nano-persona(88) + INDEX(180) = **552 lines core**, plus `brain-inject.js` (550 lines) loads memory/wiki/skills/cortex/energy per session | verified |

The brief said "~3 of 44 hooks actually block." My count: **4 of ~30 hooks block, and only 1 of those (`bash-security-guard`) guards the bash surface.** The security perimeter is one regex file. Everything else is theater.

---

## (1) THE 5 HIGHEST-LEVERAGE STRUCTURAL CUTS

### Cut 1 — Kill the flat script graveyard. Namespace or delete.
571 `.mjs`/`.js` files dumped in `_SYSTEM/Scripts/` root. The prefixes already exist as implicit namespaces: 108 `yuri-*`, 33 `nano-*`, 28 `cyber-*`, 21 `memory-*`, 21 `lane-*`, 20 `kagami-*`, 16 `claim-*`, 15 `mcs-*`. **Move every file into its prefix-named subdir.** Then run a dead-code pass: import-graph each one, delete anything with zero live importers that isn't a CLI entry point. My prediction: 30-40% are dead — superseded scripts left behind during the "wave-3" rewrites visible in the code comments. The remaining flat root should have <50 files (true CLI entry points only).

### Cut 2 — Collapse the 5 overlapping "context/navigation/memory" subsystems into ONE.
Right now there are at least five systems doing overlapping recall/navigation work:
- `xref-query.mjs` (FTS5 + graph + GitNexus + spectrum)
- `capability-recall.mjs` (capability-first reuse)
- `yuri-navigate.mjs` (structural dependency/impact centrality)
- `yuri-id-bridge.mjs` (cross-surface canonical IDs)
- the `yuri-wiki` + `context-registry.json` + `folder-registry.json` + `artifact-registry.json` quartet

These are five indexes over overlapping data. **Pick `xref-query` as the single read surface and make the others feed it, not duplicate it.** The four registries should merge into one artifact manifest. This is the highest-leverage consolidation because every hook, every skill, and every brain-inject call hits one of these — collapsing them removes N×M coupling.

### Cut 3 — Merge the 3 memory tracks into 1 with a single read API.
The origin doc itself admits three memory tracks (Track A canonical, Track B Claude auto-memory, plus the convergence store) plus `yuri-wiki` as a "projection." That's four surfaces for one person's memory. `.claude/memory` alone has **323 files**. The convergence store was supposed to unify them but is described as "advisory-until-locally-verified and confidence-capped" — so it's a fourth layer that doesn't actually resolve anything. **One store, one read API (`recall`), one write path (gated).** Demote the others to write-only sinks that feed the one store. Delete the projection layers — projections are what databases have views for, not what an agent needs at runtime.

### Cut 4 — Collapse the advisory hook stack from ~30 to 4.
I verified: of the ~9 PreToolUse hooks, only 4 emit `deny`. The rest (`tirith-url-guard`, `directive-guard`, `filing-gate`, `math-register-guard` on Bash, `pre-tool-gate`, `musubi-protocol-enforce`) are advisory exit-0 noise that add latency and false confidence. **Delete every advisory PreToolUse hook.** Move their actual useful logic (if any) into the 4 blocking hooks. The SessionStart stack has **10 hooks** — half are `async` fire-and-forget telemetry that slow boot. Cut to 3: identity load, memory reindex, skill validation. If it's not blocking a real threat and not load-bearing for the session, it's overhead.

### Cut 5 — Prune skills from 118 to ~25 by kill-criteria.
118 skills with a 530-line index is a library nobody fully knows. Apply: **(a)** is it referenced by a live hook or recipe? **(b)** was it used in the last 30 days? **(c)** does it duplicate another skill's capability? Kill anything that fails two of three. The cognitive-framework skills (Bankai, Nen, Haki, Izanagi, Geass) are persona texture — fold their *behavioral output* into SOUL.md and delete the skill files (the file is not the behavior; the behavior is). Keep the operational skills (security-scan, cross-reference-navigation, dispatching-parallel-agents, executing-plans).

---

## (2) THE 5 HIGHEST-LEVERAGE SECURITY HARDENING MOVES

### Harden 1 — Replace the regex bash gate with a real execution policy. The regex is bypassable by construction.
This is the headline finding. `bash-security-guard.js` tokenizes with `cmd.trim().split(/\s+/)` and pattern-matches. This is defeated by:
- `$IFS` variable splitting (`ca""t .env`)
- Command substitution (`$(printf 'cat .env')`)
- Here-strings, process substitution, brace expansion
- Aliased decoders the regex doesn't know yet

The file is 1,100+ lines of regex trying to enumerate every bypass — a losing arms race. **Replace with a deny-by-default execution allowlist.** Instead of "block known-bad patterns," flip to "allow known-safe commands, deny everything else, escalate the rest." A solo founder's agent runs maybe 40 distinct command shapes (git, node, npm, find, grep, cat on non-protected paths, curl to allowlisted hosts). Enumerate the allowlist; everything else hits the confirm gate. This is less code AND more secure.

### Harden 2 — Actually sandbox bash. No sandbox = no real boundary.
`Bash(*)` is pre-approved and the only gate is advisory regex. Add a real containment layer:
- **macOS:** `sandbox-exec` with a deny-by-default profile (allow file reads in repo, writes only in repo + temp, network only to allowlisted hosts, no `fork` to arbitrary binaries)
- **Linux:** `bubblewrap` or `firejail` with equivalent profile
- **Universal fallback:** `child_process` with `RLIMIT_NPROC`, `RLIMIT_FSIZE`, dropped privileges, and a writable-path allowlist

This makes the regex gate a **second** line of defense instead of the only one. Even if the model escapes the regex, the sandbox contains the blast radius.

### Harden 3 — Network egress allowlist. The agent has `curl`/`wget`/`fetch_url` and full bash.
An agent with unconstrained network egress can exfiltrate any file it can read, or download-and-execute. The bash guard blocks `curl|sh` (good) but not `curl -o /tmp/x; bash /tmp/x` (two steps) or `curl url > file; node file`. **Add a network firewall layer:** allow egress only to a curated host allowlist (npm registry, GitHub, the LLM API, specific research domains). Block everything else at the OS level (pf/iptables rules or a proxy). This is the single highest-leverage hardening move for data exfiltration — it doesn't matter what the model *can* read if it can't send it anywhere.

### Harden 4 — Wire `ast-bash.mjs` into the live gate, or delete it. The split-mind is a vulnerability.
A real-ish bash analyzer exists in `security/ast-bash.mjs` but is only used by a static corpus scanner — **not** by the live command gate. This means the security codebase has two threat models: one for "scanning skill files" (deeper) and one for "live commands from the model" (shallower regex). The live path is weaker. **Either wire the analyzer into the live hook (so live commands get the same scrutiny as static files) or delete it** (a security tool that isn't enforced is a false sense of safety). Prefer wiring it — but only after Harden 1 (allowlist), because the analyzer is still regex-based under the hood.

### Harden 5 — Integrity-protect the security config. The guard's own registry is the weakest link.
The bash guard's comment explicitly says: *"settings.json is the hook REGISTRY — a bash write can delete every guard registration, so writes are blocked."* Smart. But: can the model write to `_SYSTEM/Scripts/yuri-operator.cjs` (the role resolver)? Can it write to `bash-security-guard.js` itself? If the model can edit the guard's source or the role module, it can neuter every protection in one Edit. **Hash-pin and read-only-mark the entire security surface:** `bash-security-guard.js`, `yuri-operator.cjs`, `yuri-safety-core.mjs`, and `settings.json`. Verify the hash at SessionStart. Any drift = abort + alert. The guard must guard itself.

---

## (3) THE ONE COMPOUNDING CHANGE

**Collapse the identity/context/memory/hook layer into a single typed `YuriCore` module with one deterministic init path and one read API.**

Right now the session boot is: 10 SessionStart hooks → brain-inject (550 lines reading 8+ files) → SOUL + origin + persona + INDEX (552 lines) → memory reindex → skill validation → energy weights → cortex state → wiki. Every subsystem reads its own config, its own memory, its own graph. This is why there are 8,893 markdown files — each subsystem documents itself separately.

If you build **one** `YuriCore` module that:
1. Loads identity + memory + graph + energy in one typed init (not 10 hooks)
2. Exposes one `recall(query)` API (collapses xref + capability + navigate + wiki)
3. Exposes one `guard(action)` API (collapses the 4 blocking hooks + allowlist + sandbox)
4. Has one config schema (collapses the 4 registries)

...then every cut after it gets easier: script namespacing has one import root, skill pruning has one capability index, memory consolidation has one store, security hardening has one guard surface to pin. **This is the keystone — pull it and the arch reorganizes around it.** Without it, every individual cut is fighting the coupling.

Estimated impact: this single change reduces the boot path by ~60%, eliminates the 5 overlapping recall systems, and gives security a single enforceable boundary instead of 30 advisory hooks.

---

## (4) DO NOT CUT / DO NOT TOUCH

**Load-bearing core — cut these and the agent dies:**

| Surface | Why it's sacred |
|---|---|
| `_SYSTEM/Scripts/math/yuri-energy.mjs` + `energy-enforce.mjs` | The Lyapunov-style gate is the only principled decision boundary. It's the one thing doing real computational work, not regex. |
| `.claude/settings.json` deny-list | This is the actual filesystem-level protection (`.env`, `backend/data`, `.claude/state`). The hooks are advisory; **this** is what actually blocks reads. Do not weaken it during hook cleanup. |
| `bash-security-guard.js` (the deny path) | Until a replacement ships, this is the only live bash gate. Improve it, don't delete it. The regex is weak but it's currently the only thing standing. |
| `xref-query.mjs` | The one genuinely useful recall surface. Build the consolidation *around* it, don't rip it out. |
| `SOUL.md` | 92 lines. Already lean. This is the persona — the thing that makes Yuri *Yuri*. |
| `yuri-origin.md` authority hierarchy | The one document that resolves conflicts. Every other doc defers to it. |
| The nano-swarm dispatch (`llm-compat-contract.mjs` + `spawn_nano` path) | The multi-lane capability is the "more powerful" half of "simpler but more powerful." Don't cut the thing that gives you leverage. |
| `_SYSTEM/yuri-graph.json` + `yuri-graph-unify.mjs` | The canonical graph with lossless projections. This is structural truth. Cutting it fragments the system into the exact sprawl you're trying to fix. |

**Where cutting risks breakage:**

- **The 4 registries** (`context-registry`, `folder-registry`, `artifact-registry`, `skill-index`) — many hooks and scripts reference them by path. Consolidate *behind a facade*, don't delete the old paths until all references are migrated. A blind registry delete will break 20+ importers silently.
- **`brain-inject.js`** — it's bloated (550 lines, 8 file reads) but it's the *only* thing loading memory context into the session. Replace it with the `YuriCore` init, don't delete it first.
- **The Kagami event bus** — if any autonomy/verification flow depends on it, removing it breaks the evidence chain. Audit consumers before touching.
- **The memory DBs** (`OS_KERNEL/memory.db`, `state/memory-canonical/`) — these are the durable state. Schema-migrate, never truncate.

---

## The divergent take (where I differ from the likely consensus)

Most lanes will tell Marcel to "cut scripts, consolidate docs, clean up hooks." That's inventory management. My claim is different: **the problem isn't volume, it's the absence of a single enforceable boundary.** 826 scripts is a symptom; the disease is that there's no `YuriCore` forcing every subsystem through one typed init + one guard API + one read API. Clean up 400 scripts without building the core and the sprawl returns in 3 months — because nothing structurally prevents it.

And on security: the regex gate isn't "a weakness to patch." It's a **category error**. You cannot enumerate-malicious your way to safety on an adversarial input (the model's own output). The only correct architecture for an agent with full bash is **deny-by-default allowlist + OS-level sandbox + network egress control + self-integrity protection.** Anything less is a regex prayer. Marcel has a real agent with real capabilities and one regex file between it and the shell. That gap is the thing to close — not the script count.

---

`08GL_YURI_CORE_CUT_AND_HARDEN_RULING_X_PASS_COMMITTED`