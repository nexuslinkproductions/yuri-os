# Fable-5 Protocol (DRAFT)

> **Status:** DRAFT for orchestrator review. Target canonical home: `_SYSTEM/FABLE-5-PROTOCOL.md`.
> **Authoring pass:** CF4 protocol doc (2026-07-07). Do not treat this draft as live doctrine until Marcel approves promotion.

---

## 1. What Fable-5 is

**Fable-5** is **`anthropic/claude-fable-5` at high reasoning** — a one-shot **mastermind synthesizer / overseer** spawned **once**, **after** a multi-model prep fan-out has finished investigating a problem.

Its job is **not** to redo prep work. It **synthesizes, judges, corrects, and CUTS** lane outputs into a definitive ruling, re-verifying every load-bearing claim against live evidence (code, config, git history) — never trusting a lane summary blind.

**Canonical identity anchor:** `~/.omp/agent/agents/fable-synth.md` — the live custom agent definition for this model in the OMP harness.

### What Fable-5 is NOT

| Misconception | Truth |
|---|---|
| GLM-5.2 / `zai/glm-5.2` | **Wrong model.** GLM is a prep-lane substrate, not Fable-5. |
| `cursor/composer-2.5-fast` | **Wrong provider.** Composer is a fast parallel worker lane, not the mastermind. |
| A prompt-only wrapper | **Wrong.** Fable-5 is a **specific provider model** dispatched through OMP's custom-agent mechanism — not a persona label you can paste onto any session. |
| The orchestrator session | **Wrong.** The orchestrator decomposes prep, dispatches lanes, and adjudicates Fable's output. Fable runs **once** as the final synthesis pass. |
| A local / distilled model | **Wrong.** Despite unrelated repo mentions of "Fable-5 distill" Gemma weights (Jeffrey conveyor research), **session Fable-5 = `anthropic/claude-fable-5` only.** |

**Stale brief warning:** `FABLE-BRIEF.md` line 3 still says `(glm-max / glm-5.2, --reasoning high)`. That wording predates the confirmed model identity. Treat it as **stale**; the authoritative model string is `anthropic/claude-fable-5`.

---

## 2. When to invoke Fable-5

Invoke **once per major decision surface**, **after** prep lanes return artifacts — not at the start, not repeatedly for the same question.

### Invoke when

- **Final synthesis / adjudication** over a multi-lane prep fan-out (native Claude lanes + GLM + deepseek-flash + composer-fast + optional MURE dry-run).
- **High-stakes doctrine or audit rulings** where wrong cuts or wrong builds have asymmetric cost (security de-bloat, global CLAUDE.md evolution, role/architecture spec locks).
- **Owner wants a decisive ruling**, not a menu — the prep was deliberately heavy; Fable's output must be the **smallest solid thing** that resolves the question.

### Do NOT invoke when

- The task is a **single-lane** read, grep, or small edit — use the orchestrator or a worker lane directly.
- Prep is **incomplete** — Fable is the *end* of the fan-out, not a substitute for missing lanes.
- You need **iterative back-and-forth** with Marcel on a half-formed idea — that's orchestrator work; Fable is one-shot.
- The deliverable is **owner-gated live mutation** (commit, swap live CLAUDE.md, arm a build) — Fable writes **candidates + rationale**; Marcel/orchestrator applies after verification.

### Anti-pattern

Spawning Fable-5 **before** prep finishes, or spawning it **twice** on the same evidence set "just to be sure." If the first pass was wrong, fix the brief or the prep — don't burn a second mastermind run without new evidence.

---

## 3. How to dispatch Fable-5 (OMP harness)

Fable-5 is **not** selected via the 9-slot `modelRoles` table in `~/.omp/agent/config.yml`. It bypasses that limit through OMP's **custom task-agent definition** mechanism.

### 3.1 Custom agent definition (the mechanism)

Create or maintain a markdown file at:

```
~/.omp/agent/agents/<name>.md
```

OMP discovers these from `~/.omp/agent/agents/*.md` (user-level; project-level `.omp/agents/*.md` also works with higher precedence). Frontmatter fields that matter:

| Field | Fable-5 value | Notes |
|---|---|---|
| `name` | `fable-synth` | Stable spawn id for `task(agent: "fable-synth", …)`. |
| `description` | one-line purpose | Shown in agent discovery surfaces. |
| `model` | `anthropic/claude-fable-5` | **Exact provider/model string.** This is the whole point. |
| `thinkingLevel` | `high` | OMP accepts `thinkingLevel` or `thinking-level` in frontmatter. |
| `tools` | `read, grep, glob, write, bash` | Match the assignment; Fable needs evidence access, not orchestration tools. |
| `read-summarize` | `false` | Fable reads primary sources; summarization adds drift. |

Body text = standing operating instructions (mastermind framing, anti-over-engineering, output discipline). See live file `fable-synth.md` for the current template.

**Why this works:** Custom agent defs carry their own `model:` frontmatter. OMP's task executor resolves the agent definition first; the model string routes to the Anthropic provider without consuming a `modelRoles` slot.

### 3.2 Spawning Fable-5 from the orchestrator

From the main OMP orchestrator session (the interactive harness session):

```
task(
  agent: "fable-synth",
  id: "FableSynth",
  description: "<one-line purpose>",
  assignment: "<full FABLE-BRIEF.md contents or pointer + deliverable list>"
)
```

Discipline:
- **One spawn** per mastermind pass.
- Write deliverables to **named files** in the assignment — not only chat output.
- End chat reply with a **bounded executive digest** (≤25 lines per brief convention).
- Fable does **not** commit, push, or overwrite live doctrine files unless the brief explicitly names a candidate path and still expects owner swap.

### 3.3 Reaching other cloud models the same way

Any model reachable in OMP can be assigned to a custom agent def the same way — **without** expanding `modelRoles`:

| Agent file (live) | Model string | Role |
|---|---|---|
| `~/.omp/agent/agents/deepseek-flash.md` | `ollama-cloud/deepseek-v4-flash` | Fast bulk analysis / critique lanes |
| `~/.omp/agent/agents/composer-fast.md` | `cursor/composer-2.5-fast` | Fast parallel drafting |
| *(create as needed)* | `zai/glm-5.2:xhigh` | GLM peer / build lanes |
| *(create as needed)* | `anthropic/claude-opus-4-8:xhigh` | Native deep reasoning lanes |

Pattern for a new lane model:

```yaml
---
name: glm-peer
description: GLM-5.2 peer lane for parallel prep work
model: zai/glm-5.2:xhigh
tools: read, grep, glob, write, bash
read-summarize: false
---

<lane-specific discipline prose>
```

Then: `task(agent: "glm-peer", assignment: "…")`.

**`modelRoles` vs custom agents:**
- `modelRoles` in `config.yml` = default models for the **main session** and built-in role aliases (`default`, `slow`, `task`, …). **9 slots, already full.**
- Custom agent defs = **per-spawn model override** for task subagents. **No slot limit.** This is how Fable-5 and specialty lanes coexist.

### 3.4 What Fable-5 is NOT dispatched through

- **Not** `glm-fleet.mjs` / `ollama-fleet.mjs` — those are YURI script dispatchers for MURE/company cycles, not OMP task agents.
- **Not** Claude Code native `Agent()` tool from a Claude Code session — different harness; this protocol is OMP-specific.
- **Not** by renaming a brief to say "you are Fable-5" while running a different model — that produces **Fable-shaped prose without Fable-grade reasoning.**

---

## 4. Brief-writing convention (mandatory)

Every Fable spawn gets a **FABLE-*-BRIEF.md** (or equivalent) written by the orchestrator. The brief is the contract.

### 4.1 Mastermind framing

Open with:

> You are **Fable-5 at high reasoning** (`anthropic/claude-fable-5`), spawned **once** as the mastermind overseer of prep that already ran. Your job is not to redo their work — **synthesize, judge, correct, and produce the deliverable files.**

Include:
- Repo root + branch.
- Operator name (Marcel — never "Rick").
- Protected paths off-limits.
- Explicit **deliverable file list** with exact paths.

### 4.2 READ FIRST — do not re-derive from zero

List prep artifacts in read order (`prep-A`, `prep-B`, lane outputs, INDEX.md maps). Instruct:

> Read the inputs yourself. **Do not trust summaries alone** — spot-verify load-bearing claims against live code/config.

This implements **Rule 1** (caller-surface verification): before CONFIRMED-DEAD/SHIPPED/MISSING, check every runtime reach path (.mjs, .js, .cjs, .sh, dynamic import), not the first grep extension.

### 4.3 Decisive ruling, not a menu

- Anti-over-engineering is the prime directive: **when in doubt, CUT.**
- Every build/cut claim needs symmetric burden of proof (**Rule 3**).
- Sort findings into **closed tiers** (CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION or FIX / IMPROVE / LEAVE-ALONE) — "unclear" alone is unacceptable (**Rule 2**).
- Multi-phase plans must state **why each phase precedes the next** (**Rule 4**).
- When prep lanes disagree, adjudicate **claim-by-claim** with named root-cause — never by model rank (**Rule 6**).

### 4.4 Output discipline (Rule 7)

1. **Write durable artifacts first** — named files, not chat-only dumps.
2. **Chat reply = bounded digest** — hard cap (~25 lines unless brief specifies otherwise).
3. **Ruling labels** on resolved questions in the artifact (`T1:`, `RULING:`, tier headers).
4. **Single top-priority closer** — one sentence a time-constrained reader can act on alone.

### 4.5 Residual risk (Rule 8)

Every deliverable set must include a **Residual risk** section:
- Name the **specific checkable trigger** that would flip each judgment — not generic hedging.
- Explicitly split **fixed/decided now** vs **deliberately deferred to owner**.

### 4.6 Brief skeleton (copy/adapt)

```markdown
# FABLE-5 BRIEF — <topic> (<date>)

You are **Fable-5 at high reasoning** (`anthropic/claude-fable-5`), spawned once as mastermind
overseer. Synthesize prep; do not redo it. Spot-verify load-bearing claims against live code.

Repo: `/Users/marcelspatz/YURI-OS-MUSUBI` (main). Operator: Marcel.

## READ FIRST
1. `<prep artifact paths>`

## DELIVERABLES (write all; digest-only in reply)
1. `<exact output path>` — <what>

## OUTPUT DISCIPLINE
- Write files; end reply with ≤25-line digest.
- Decisive ruling, not a menu.
- Residual risk section with flip-triggers.
```

---

## 5. Prior passes (documented)

Five Fable-5 passes are documented in `02_RESOURCES/RESEARCH/` prior to the current evolution folder. They establish the recurring methodology extracted in `prep-A-fable-methodology.md`.

| Pass | Date | Domain | Brief | Primary outputs |
|---|---|---|---|---|
| **1 — Role synthesis** | 2026-07-05 | Yuri assistant role + solid-minimal setup | `yuri-assistant-role-synthesis-2026-07-05/FABLE-MASTER-BRIEF.md` | `FABLE-PASS-1-SYNTHESIS.md`, `FABLE-PASS-2-RATIONALE.md`, `~/.claude/CLAUDE.md.fable-candidate` |
| **2 — Global CLAUDE.md lean fix** | 2026-07-05 | Same pass, deliverable 2 | (same brief) | Lean global CLAUDE.md candidate; stopped @-pulling full YURI spine into every session |
| **3 — Full logic inspection** | 2026-07-06 | Opus-fleet / MURE honesty patch-set | (mastermind verdict brief implicit in fan-out) | `yuri-full-logic-inspection-2026-07-06/01-FABLE-MASTERMIND-VERDICT.md` |
| **4 — Structural + security audit** | 2026-07-06 | De-bloat + security hardening | `yuri-structural-security-audit-2026-07-06/FABLE-AUDIT-BRIEF.md` | `FABLE-AUDIT-SYNTHESIS.md` |
| **5 — Code-fix commits** | 2026-07-06 | Post-audit execution | (no brief — commit messages carry rationale) | `git show 18322046` (opus-fleet-v2 fix), `git show 1889cc83` (AMS deck fix) |

**Pass 6 (in flight):** `global-claude-md-fable5-evolution-2026-07-07/` — distill Rules 1–8 into global `.claude/CLAUDE.md` + persona candidates; this protocol doc is a sibling artifact from the same orchestration wave.

**Methodology source of truth:** `prep-A-fable-methodology.md` — 8 extracted rules with citations and overlap verdict against persona/SOUL/global floor.

---

## 6. Orchestrator checklist (pre-spawn)

Before spawning `fable-synth`, confirm:

- [ ] Prep lanes finished and artifacts exist at named paths.
- [ ] `FABLE-*-BRIEF.md` written with deliverable paths, READ FIRST list, output discipline.
- [ ] `~/.omp/agent/agents/fable-synth.md` exists with `model: anthropic/claude-fable-5` and `thinkingLevel: high`.
- [ ] Anthropic OAuth/API auth is unblocked (credential blocks cleared if rate-limited).
- [ ] Parallel critique lanes (if any) are flagged for post-Fable claim-by-claim adjudication — not pre-concession.

After Fable returns:

- [ ] Orchestrator spot-checks load-bearing claims (Rule 6 — bidirectional re-verify).
- [ ] Owner approves before promoting candidates to live paths.
- [ ] Residual-risk flip-triggers tracked if deferred.

---

## 7. Residual risk (this draft)

| Judgment | Flip trigger |
|---|---|
| `anthropic/claude-fable-5` remains the correct model id | OMP model catalog renames or removes this id → update `fable-synth.md` and §1/§3 before next spawn |
| Custom-agent dispatch stays the bypass for >9 models | OMP changes discovery path or drops per-agent `model:` frontmatter → re-verify against `omp agents` / task executor docs |
| Brief line 3 GLM wording | If a future brief still says GLM, treat as **stale** — do not infer model from brief alone; read `fable-synth.md` frontmatter |
| Five-pass table completeness | A sixth pre-2026-07-07 pass discovered in RESEARCH → append row; do not renumber methodology rules |

**Fixed in this draft:** model identity, dispatch mechanism, brief convention, prior-pass index.

**Deferred to orchestrator:** promote to `_SYSTEM/FABLE-5-PROTOCOL.md`; scrub stale GLM wording from live `FABLE-BRIEF.md`; create `glm-peer.md` custom agent if prep lanes need a standing GLM spawn id.

---

`00FB_FABLE5_PROTOCOL_DRAFT_X_PASS_COMMITTED`
