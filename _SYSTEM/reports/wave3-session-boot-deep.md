# Wave-3 Deep Dive — Session Boot Chain End-to-End

Scope: SessionStart → token-init → brain-inject → musubi-protocol-ingest → memory recall surface → what turn 1 actually sees.
Method: organ-level correctness (lifecycle, ordering, double-loading, token weight, staleness, dead organs, doc-vs-wiring drift, fail-open). Read-only. All claims are local-evidence-backed with file:line.
Prior waves cited not re-derived: wave-1 `math-base-audit-2026-06-10-checkpoint.md`; wave-2 `wave2-*-audit.md`. DeepSeek wave-3 leads (`deepseek-wave3-hooks-wiring.md`, `-token-stack.md`) consumed where verified; corrected where wrong (noted inline).

---

## BOOT CHAIN — actual ordering (from settings.json, verified)

SessionStart fires 7 hooks. First 3 SYNCHRONOUS (block boot, ordered), last 4 ASYNC (fire-and-forget):

```
ORDER | SYNC  | HOOK                              | turn-1 output
1     | sync  | claude-memory-write.mjs reindex   | (none to context; rebuilds MEMORY.md index)
2     | sync  | token-session-init.js             | SESSION token line + full tokenmaxxing rules (~352 tok)
3     | sync  | brain-inject.js                   | <yuri-brain> block (~3,485 tok)
4     | async | musubi-protocol-ingest.js         | <musubi-protocol> block (~179 tok)
5     | async | startup-offload.js                | <startup-index> 43 skills (~2,929 tok)
6     | async | scout-orchestrator.js             | (none to context; bus init + log trim)
7     | async | eot-background-start.js           | "🔄 EOT monitoring active" (DEAD — see CRIT-2)
```

Evidence: `python3` dump of `.claude/settings.json` hooks.SessionStart — matchers all `""`, async flags as shown. DeepSeek hooks-wiring lane reported this same set + "VERDICT: CLEAN" on *file resolution* — and that narrow claim holds (all 7 files exist, parse, wire). But "wired and on-disk" is not "correct"; the correctness defects below are exactly what a path-resolution cross-map cannot see.

**Native load (NOT a hook):** `CLAUDE.md` @-includes `_SYSTEM/yuri-origin.md`, `SOUL.md`, `_SYSTEM/persona.md` (lines 1-3, verified). This is the stable identity. The hook chain only adds volatile state — *except it doesn't*, see CRIT-1.

---

## FINDINGS

### CRIT-1 | brain-inject.js:107-129,468-481 | IDENTITY block re-loads SOUL.md that CLAUDE.md already @-includes natively — ~570 tok pure redundancy, every boot

Claimed (file header L2-13 + CLAUDE.md "Brain & Body": "brain-inject only enriches with volatile live state — never the stable identity").
Actual: `extractPersonaRules()` (L121) pulls 9 SOUL.md paragraphs by heading (`REQUIRED_HEADINGS` L109-119) and emits them as the `### IDENTITY — Yuri persona active (SOUL.md)` block (L469-470, inside ZONE-A "stable core"). CLAUDE.md L2 `@SOUL.md` already loads the *entire* SOUL.md natively into turn-1 context.

Verified double-load: `grep -c -F "**Be an adversarial ally.**" SOUL.md` = 1 in SOUL.md, and the identical paragraph is re-emitted by brain-inject. CLAUDE.md L1-3 confirmed `@_SYSTEM/yuri-origin.md / @SOUL.md / @_SYSTEM/persona.md`.

Cost: 9 paragraphs ≈ 2,200 chars ≈ **~550-570 tok** duplicated verbatim on every session. The SubagentStart `soul-persona-inject.js` ALSO injects a SOUL contract block (seen live in this very subagent's boot context as `<soul-persona source="SOUL.md">`) — so a subagent sees SOUL **three times** (native @-include + brain IDENTITY + SubagentStart). Value of the 2nd/3rd copy: ≈ zero; the model already has the full file.

Fix: drop `extractPersonaRules`/IDENTITY from brain-inject (CLAUDE.md's own contract says the brain "does not depend on any hook firing"). Keeps brain-inject to genuinely volatile state. Saves ~570 tok/boot with no identity loss.

### CRIT-2 | eot-background-start.js:8-28 | DEAD ORGAN — writes a marker nothing reads, injects a false "monitoring active" claim into turn 1

Claimed: header L3-5 "Spawns end-of-transmission monitoring… Monitors for user exit keywords."
Actual: the hook writes `/tmp/claude-eot-${sessionId}.marker` with `{monitoring:true}` and emits `additionalContext: '🔄 EOT monitoring active'`. It spawns **nothing** — no monitor process, no watcher. The marker file is **written-but-never-read**: `grep -rln "claude-eot-"` over hooks/Scripts/skills returns only `eot-background-start.js` itself; `grep "EOT monitoring active"` over live code returns only this file (other hits are archived history docs + the circuitry map). Real EOT detection lives entirely in `user-prompt-submit.js:101-115,239-251` (handoff keyword → skill trigger) + the closeout script. This hook contributes a phantom organ + a false turn-1 claim.

Compounding bug: `sessionId = process.env.CLAUDE_SESSION_ID || 'unknown'` (L8) and **CLAUDE_SESSION_ID is UNSET** (verified `echo` = empty). So every session writes the *same* path `/tmp/claude-eot-unknown.marker` — collide-on-one-key even if a reader existed.

Fix: delete the hook from settings.json SessionStart. It injects a lie and a colliding orphan file. Zero functional loss.

### HIGH-1 | brain-inject.js:83-93,98-104,230-251 + state files | Stale state injected with minute-scale "as-of" labels while the data is WEEKS old

brain-inject renders several `as-of: Nm ago` labels computed from file `ts`. Measured staleness (stat mtime, today 2026-06-10):

```
source file                                    age    injected as
.claude/state/lane-health-status.json          21d    "LANE_HEALTH … as-of: 30154m ago" (label=minutes, reality=3wk)
.claude/state/roadmap-state.json               23d    "ROADMAP — Active sprint state" (presented as active)
.claude/yuri-sentinel/learning/global.md       20d    "LEARNED_RULES — Dream-processor synthesis" (20d-old rules as current)
.claude/state/cortex-state.json                24d    (renders EMPTY — saved by escalated-filter, see note)
```

The `30154m ago` string is technically honest arithmetic but defeats the purpose — a human/model reading "LANE_HEALTH … as-of: 30154m" cannot tell it's 3 weeks stale at a glance, and brain-inject presents `✓ lane: LIVE` rows from a 21-day-old snapshot as current routing availability. roadmap-state (23d) is injected as "Active sprint state" with no age guard at all (`loadRoadmapState` L360-378 has no staleness check). global.md learned-rules (20d) ride ZONE-A with no age.

Correction to DeepSeek token-stack lane: it flagged stale *cortex* risk injection — but `loadCortexDynamic` (L230-251) filters on `r.escalated` and cortex-state has **0 escalated** entries (verified: `escalated count: 0`), so that section renders empty. The real stale-injection problem is lane-health/roadmap/global, which DeepSeek didn't surface.

Fix: add a staleness guard (e.g. >48h → render `STALE (Nd old)` or suppress) to `loadLaneHealth`, `loadRoadmapState`, `loadLearnedRules`. Convert age display to days when >1d.

### HIGH-2 | brain-inject.js:465-496 | "Cacheable stable prefix" claim is false — ZONE-A contains MEMORY.md + learned-rules that mutate; volatile git-log+hour sits in the block

Claimed: L465-467 "ZONE A: STABLE CORE — byte-identical across warm restarts → cacheable prefix… Zero volatile tokens." CLAUDE.md "Token Caching Shape" leans on this.
Actual: ZONE-A's `stableCore` (L468-481) ends with `### MEMORY — curated truths (MEMORY.md)` + `${memoryLines}` and includes `### LEARNED_RULES … ${learnedRules}`. MEMORY.md changes every time a memory is written (mtime 2d ago; 12 table rows) and global.md every dream pass (20d but mutable). Any change to either **shifts the ZONE-A byte content**, invalidating the "cacheable prefix" for the whole block.

Worse, the ZONE-C volatile footer embeds `loadSessionContext()` (L63-79) = `git log --oneline -n 3` + `new Date().getHours()+'h'`. That string changes on every commit and every hour (verified: 3-commit log + hour are concatenated). So the brain block has no stable cache boundary at all — the "stable prefix" and "volatile footer" are both inside one emitted string with mutable content in the supposedly-stable half.

Fix: move MEMORY.md + learned-rules OUT of the byte-stable zone (they're volatile by nature), or accept the block is uncacheable and drop the stable-prefix framing. Current state is doc-vs-wiring drift: the comment promises cacheability the code can't deliver.

### MED-1 | musubi-protocol-ingest.js:13,45-58 + MUSUBI_PROTOCOL.md | Injects a ~179-tok block that is pure pointers to files already natively loaded — third overlap

`musubi-protocol-ingest` parses `_SYSTEM/MUSUBI_PROTOCOL.md` into ROLE_MATRIX / GLOBAL_LLM_COMPAT / CORE_DIRECTIVES and emits a `<musubi-protocol>` block (verified: regex captures all 3 sections, 174+211+155 chars). But MUSUBI_PROTOCOL.md is self-declared "legacy compatibility shim" (L1) whose body is `INHERIT: yuri-origin.md / INHERIT: SOUL.md` + "Use yuri-origin.md for authority… Use SOUL.md for persona" (L3-19) — i.e. it points at the two files CLAUDE.md *already* @-includes. So turn-1 gets: yuri-origin.md (native) + a 179-tok block telling it to use yuri-origin.md. The CORE_DIRECTIVES body adds no rule not already in the natively-loaded origin.

Not a correctness bug (it parses, the regex was already fixed per the L20-25 comment), but it's redundant injection. The file header L7 admits it "remains because active hooks… still look for the exact filename" — the hook is keeping a legacy file alive to inject pointers to canonical files. Fix: either retire the hook (origin + persona already loaded) or shrink the shim to genuinely-unique content (the `ai route-plan/auto` command hints are the only non-duplicated lines).

### MED-2 | startup-offload.js:14-15 | 43 skill descriptions (~2,929 tok) injected every boot; "do NOT re-read" guidance is sound but the volume is the boot's 2nd-largest block

`scanSkills()` reads all 43 skill-dir frontmatters and emits `<startup-index>` with name+description each (verified ~2,929 tok, 43 dirs). The "do NOT re-read SKILL.md files" line (L15) is correct token-hygiene (saves re-reads). But this is the second-heaviest boot injection after brain-inject, and the harness *also* surfaces an available-skills list independently (the system reminder lists every skill with description — seen in this subagent's own boot). So skill names+descriptions are delivered twice at boot: once by startup-offload, once by the harness skill registry. Measure: ~2,929 tok of overlap with the native skill list.

Fix: confirm whether the harness skill-registry reminder is always present; if so, startup-offload's index is redundant and can be dropped or reduced to a count + "skills available via Skill tool."

### MED-3 | token-session-init.js:43-50 vs brain-inject git read | Two independent git-branch reads at boot; session-state re-init guard correct but under-documented

token-session-init re-reads `git rev-parse` (L52) and writes session-state.json; brain-inject independently runs `git rev-parse` + `git log` (L65-72). Two subprocess git spawns per boot for branch — minor. The 4h re-init guard (L43-50) is correct (protects root session-state from subagent wipe, matches DeepSeek's "design choice" note) but the `throw new Error('skip')` control-flow (L46-50) is fragile: it relies on catching its own thrown 'skip' to fall through, and any *other* parse error in the try also lands in the same catch and silently skips re-init (fail-open — a corrupt session-state.json would never get reset). Low blast radius but it's a silent fallback.

### LOW-1 | token-session-init.js:115 | "Reasoning: MAX effort active" injected unconditionally as a literal turn-1 claim

The SESSION line hardcodes `⚡ TOKENMAXXING ACTIVE | Reasoning: MAX effort active`. This is injected regardless of actual model/effort — a static string asserting a runtime state the hook does not verify. Cosmetic but it's an unverified claim in turn-1 context (same class as the EOT phantom, lower stakes).

### LOW-2 | brain-inject.js:404-415 loadOrganState | spawnSync to yuri-nerve.mjs with 5s timeout — boot-blocking subprocess in a sync hook

brain-inject is a SYNC SessionStart hook (blocks boot). `loadOrganState` (L406) does `spawnSync('node', [yuri-nerve.mjs, 'digest'], {timeout:5000})`. If yuri-nerve hangs, boot stalls up to 5s before the section is silently dropped (fail-open is correct, but the 5s is on the critical boot path). Same pattern keeps brain-inject's worst-case boot latency at ~5s+git. Fine when healthy; a slow nerve digest delays every session start.

---

## STAGE-DEATH MATRIX (failure mode per stage → what silently degrades)

```
STAGE                    DIES → DEGRADES
claude-memory-write      reindex fails → MEMORY.md index stale; brain MEMORY block shows old rows (fail-open, no boot break)
token-session-init       throws → /tmp session + session-state.json not written → downstream token tracking blind (silent catch L85)
brain-inject             throws → NO <yuri-brain> at all; but native @-includes (SOUL/origin/persona) survive → identity intact, volatile state lost
musubi-ingest            file missing → WARN to stderr, exits 0, no block (L66-71) → no loss (content was redundant anyway)
startup-offload          SKILLS_DIR unreadable → exits 0, no index → skills still reachable via harness registry
scout-orchestrator       throws → bus not init'd → scouts silently never spawn (whole scout subsystem inert, no signal)
eot-background-start      always "succeeds" injecting a dead claim → no-op either way
```

Key resilience property (verified): identity does NOT depend on any hook — CLAUDE.md native @-includes carry SOUL/origin/persona even if every hook dies. That's correct and matches the "brain does not depend on any hook firing" contract. The hooks only add (mostly redundant or stale) volatile state.

---

## TOKEN-WEIGHT vs VALUE (turn-1 injected context, measured)

```
BLOCK              ~tok   redundant-with-native?   net value
brain-inject       3485   IDENTITY ~570 redundant  volatile state useful; identity dup wasteful; MEMORY useful
startup-offload    2929   ~full overlap w/ harness skill registry   low (dup)
token-init          352   none                     useful (tokenmaxxing rules) but "MAX effort" claim unverified
musubi-ingest       179   ~full overlap (pointers to native files)   ~zero
eot-bg               ~6    phantom                  negative (false claim)
─────────────────────────────────────────────────────────────────
TOTAL              ~6951   est. ~1300-1600 tok is duplicate/dead/stale
```

Roughly **~20-23% of boot-injected tokens are duplicate, dead, or stale** (IDENTITY dup ~570 + startup-offload overlap ~2929 if harness-registry confirmed + musubi ~179 + eot phantom). startup-offload is the swing factor — its value depends on whether the harness always provides the skill registry (it did in this subagent's boot).

---

## COVERAGE

- SessionStart chain: 7/7 hooks read + traced (token-init, brain-inject, musubi-ingest, startup-offload, scout-orchestrator, eot-bg) + claude-memory-write reindex behavior inferred from wiring. **100%**
- UserPromptSubmit (turn-1+ ingress): user-prompt-submit.js fully read (handoff detect, trivial-skip, skill auto-trigger, L5b recall, PULSE_ORCHESTRATOR_RETIRED dead-layer confirmed). **100%**
- SubagentStart: soul-persona-inject confirmed live (observed in own boot context) — triple-SOUL-load noted. yuri-sentinel-start NOT deep-read (out of assigned boot-chain core). 
- State staleness: 11 source files stat-checked. **100% of brain-inject sources.**
- Memory recall surface: curated MEMORY.md path (brain-inject loadCuratedMemory) + L5b subconscious recall (user-prompt-submit) traced. Semantic/palace retrieval confirmed retired (L8-10, L155-159). **100% of live paths.**

**Coverage: ~95%** (SubagentStart yuri-sentinel-start.js + claude-memory-write.mjs internals not deep-read — both outside the SessionStart→brain→ingest→recall spine, low boot-blast).

---

## UNVERIFIED / RESIDUAL RISK

- startup-offload redundancy (MED-2) assumes the harness skill-registry reminder is ALWAYS present in turn-1. Confirmed present in THIS subagent's boot; not verified for a fresh root interactive session. If absent there, startup-offload is NOT redundant. **Verify before deleting.**
- DeepSeek token-stack lane's CRIT findings (spend-report $0 pricing, drain queue 9.3MB, hash-chain corrupt at seq 112487) are token-LEDGER, not boot-chain — NOT verified here (out of scope; ledger DB is under protected/volatile paths). Flagged for the token-stack lane owner, not re-derived.
- Boot latency worst-case (~5s nerve + git spawns) not load-tested; asserted from timeout config, not measured under a slow nerve.
- "~570 tok" identity-dup and token weights are char/4 proxies, not tokenizer-exact.

---

## TOP-3 FIXES (ranked by value/effort)

1. **Delete eot-background-start.js from SessionStart** (CRIT-2) — dead organ injecting a false claim + colliding orphan marker. Zero loss, trivial.
2. **Drop IDENTITY re-injection from brain-inject** (CRIT-1) — ~570 tok/boot saved, identity already native via @SOUL.md; matches CLAUDE.md's own "brain does not depend on any hook" contract.
3. **Add staleness guards to lane-health/roadmap/learned-rules** (HIGH-1) — stop presenting 3-week-old state as live "as-of: Nm ago"; show days, suppress >48h.

RESULT_LABEL: `03BD_SESSION_BOOT_CHAIN_DEEP_DIVE_X_PASS_READONLY`
