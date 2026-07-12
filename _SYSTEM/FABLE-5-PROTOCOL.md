# Fable-5 Protocol

> **Status:** ARCHIVAL — Fable 5 is excluded from active MURE routing. Retained as historical protocol evidence from the 2026-07-07 pass.
> (`02_RESOURCES/RESEARCH/global-claude-md-fable5-evolution-2026-07-07/mure-CF4-protocol-doc-draft.md`),
> corrected against the live OMP agent roster and config the same day. Orchestrator verifies before commit.

---

## 1. What Fable-5 is — and the access reality

**Fable-5** is **`anthropic/claude-fable-5` at high reasoning** — a one-shot **mastermind synthesizer / overseer** spawned **once**, **after** a multi-model prep fan-out has finished investigating a problem.

Its job is **not** to redo prep work. It **synthesizes, judges, corrects, and CUTS** lane outputs into a definitive ruling, re-verifying every load-bearing claim against live evidence (code, config, git history) — never trusting a lane summary blind, checking every caller surface rather than the first one searched.

**ACCESS IS EPHEMERAL.** `anthropic/claude-fable-5` is available **2026-07-07 only** (limited-availability model window). It is not a standing roster member.

**Durable mastermind stand-in: `anthropic/claude-opus-4-8`** (dispatch as `anthropic/claude-opus-4-8:xhigh` for the mastermind role). When Fable-5 is unreachable, the SAME protocol runs on the stand-in: same brief convention, same one-shot discipline, same output contract. The protocol is model-portable by design — what makes a pass "Fable-grade" is the methodology (now encoded in the global reasoning floor plus this doc), enforced by the brief, executed at the highest reasoning tier available.

**Archival identity anchor:** `_SYSTEM/mure/agents/fable-synth.md`. The catalog marks this agent disabled; it is not a selectable MURE route. Durable synthesis work is assigned through the active provider-neutral archetypes instead.

### What Fable-5 is NOT

| Misconception | Truth |
|---|---|
| GLM-5.2 / `zai/glm-5.2` | **Wrong model.** GLM is a prep-lane substrate, not the mastermind. |
| `cursor/composer-2.5-fast` | **Wrong provider.** Composer is a fast parallel worker lane. |
| A prompt-only wrapper | **Wrong.** Fable-5 is a specific provider model dispatched through OMP's custom-agent mechanism — not a persona label pasted onto any session. Renaming a brief to say "you are Fable-5" while running a weaker model produces Fable-shaped prose without Fable-grade reasoning. |
| The orchestrator session | **Wrong.** The orchestrator decomposes prep, dispatches lanes, and adjudicates Fable's output. Fable runs once as the final synthesis pass. |
| A local / distilled model | **Wrong.** Repo mentions of "Fable-5 distill" Gemma weights (Jeffrey conveyor research) are unrelated. Session Fable-5 = `anthropic/claude-fable-5` only; stand-in = `anthropic/claude-opus-4-8` only. |

**Stale-brief warning:** the 2026-07-07 `FABLE-BRIEF.md` line 3 says `(glm-max / glm-5.2, --reasoning high)` — stale wording predating the confirmed model identity. Never infer the model from a brief; read `fable-synth.md` frontmatter.

---

## 2. When to invoke

Invoke **once per major decision surface**, **after** prep lanes return artifacts.

### Invoke when
- **Final synthesis / adjudication** over a multi-lane prep fan-out (native Claude lanes + GLM + deepseek-flash + composer-fast + optional MURE wave).
- **High-stakes doctrine or audit rulings** where wrong cuts or wrong builds carry asymmetric cost (security de-bloat, global CLAUDE.md evolution, role/architecture spec locks).
- **Owner wants a decisive ruling, not a menu** — prep was deliberately heavy; the output must be the smallest solid thing that resolves the question.

### Do NOT invoke when
- The task is a single-lane read, grep, or small edit — use the orchestrator or a worker lane.
- Prep is incomplete — Fable is the *end* of the fan-out, not a substitute for missing lanes.
- You need iterative back-and-forth with Marcel on a half-formed idea — orchestrator work; Fable is one-shot.
- The deliverable is owner-gated live mutation of doctrine files — Fable writes **candidates + rationale** to `*.fable-candidate-*` / research paths; the orchestrator swaps after cross-verification.

### Anti-pattern
Spawning the mastermind **before** prep finishes, or **twice** on the same evidence set "just to be sure." If the first pass was wrong, fix the brief or the prep — a second mastermind run without new evidence is theater.

---

## 3. Historical dispatch mechanism (retired OMP custom agents)

This section documents the former OMP mechanism. Active MURE agent cards now live exclusively in `_SYSTEM/mure/agents/`; repo-local and user-level OMP agent cards were retired on 2026-07-10.

The mastermind is **not** selected via the `modelRoles` table in `~/.omp/agent/config.yml` — that table has **exactly 9 slots** (default, smol, slow, plan, commit, advisor, designer, task, vision — verified full, 2026-07-07). Custom task-agent definitions bypass the limit entirely.

### 3.1 The mechanism

A historical OMP markdown definition lived at:

```
~/.omp/agent/agents/<name>.md  # retired for MURE
```

(user-level; project-level `.omp/agents/*.md` was also supported). Neither location is an active MURE authority now. Historical frontmatter fields were:

| Field | fable-synth value | Notes |
|---|---|---|
| `name` | `fable-synth` | Stable spawn id for `task(agent: "fable-synth", …)`. |
| `description` | one-line purpose | Shown in discovery surfaces. |
| `model` | `anthropic/claude-fable-5` | **Exact provider/model string — this is the whole point.** Repoint to `anthropic/claude-opus-4-8` when the window closes. |
| `thinkingLevel` | `high` | `thinkingLevel` or `thinking-level` both accepted. |
| `tools` | `read, grep, glob, write, bash` | Evidence access, not orchestration tools. |
| `read-summarize` | `false` | The mastermind reads primary sources; summarization adds drift. |

Body text = standing operating instructions (mastermind framing, anti-over-engineering prime directive, output discipline, confidence tiers, protected paths, no commit/push).

**Why this works:** the task executor resolves the agent definition first; its `model:` frontmatter routes to the provider directly, consuming no `modelRoles` slot. Any reachable model can be given a standing spawn id this way — no slot limit.

### 3.2 Spawning

```
task(
  agent: "fable-synth",
  id: "FableFinalSynth",
  description: "<one-line purpose>",
  assignment: "<full brief contents, or pointer to FABLE-*-BRIEF.md + deliverable list>"
)
```

Discipline: one spawn per mastermind pass · deliverables to **named files**, never chat-only · chat reply = bounded executive digest · no commit/push/live-doctrine overwrite (candidates + rationale; orchestrator finalizes).

### 3.3 The standing lane roster (verified live 2026-07-07)

Single-purpose lane agents:

| Agent file | Model | Role |
|---|---|---|
| `fable-synth.md` | `anthropic/claude-fable-5` (ephemeral → repoint to opus-4-8) | Mastermind final synthesizer |
| `deepseek-flash.md` | `ollama-cloud/deepseek-v4-flash` | Fast bulk analysis / critique lanes |
| `composer-fast.md` | `cursor/composer-2.5-fast` | Fast parallel drafting |

### 3.4 The persistent MURE MoE (20 roles, 21 agent files)

The active mixture-of-experts now lives under `_SYSTEM/mure/agents/`, with model bindings and variants in `_SYSTEM/mure/agent-catalog.json`. The former user-level `~/.omp/agent/agents/mure-*.md` copies are archived and non-authoritative.

Model spread (counted from live frontmatter, 2026-07-07): **anthropic** ×8 (4× sonnet-5, 3× opus-4-8, 1× haiku-4-5) · **cursor** ×5 (grok-4.3, grok-code-fast-1, gpt-5.5-high, composer-2.5, composer-2.5-fast) · **ollama-cloud** ×4 (nemotron-3-ultra, minimax-m3, kimi-k2.7-code, deepseek-v4-flash) · **zai** ×4 (3× glm-5.2, 1× glm-5-turbo).

Use MURE lanes as the prep/critique fan-out feeding a mastermind pass (as the 2026-07-07 evolution wave did: DS1–DS4 auditors on deepseek, CF1–CF4 drafters on composer). The mastermind adjudicates their outputs claim-by-claim; MURE lanes never self-finalize doctrine.

### 3.5 What the mastermind is NOT dispatched through

- Not `glm-fleet.mjs` / `ollama-fleet.mjs` — YURI script dispatchers for MURE/company cycles, a different substrate.
- Not Claude Code's native agent tool — different harness; this protocol is OMP-specific.

---

## 4. Brief-writing convention (mandatory)

Every mastermind spawn gets a **FABLE-*-BRIEF.md** (or an inline assignment of equal completeness) written by the orchestrator. The brief is the contract.

### 4.1 Framing
Open with: model string + "spawned once as mastermind overseer of prep that already ran — synthesize, judge, correct, CUT; do not redo prep." Include repo root + branch, operator name (Marcel — never "Rick"), protected paths, and an **explicit deliverable file list with exact paths**.

### 4.2 READ FIRST — do not re-derive from zero
List prep artifacts in read order. Instruct: read the inputs yourself; **do not trust summaries alone** — spot-verify load-bearing claims against live code/config. Before any CONFIRMED-DEAD/SHIPPED/MISSING ruling, check every runtime reach path (`.mjs`/`.js`/`.cjs`/`.sh`, dynamic `import()`), not the first grep extension.

### 4.3 Decisive ruling, not a menu
- Anti-over-engineering is the prime directive: **when in doubt, CUT**; a recommendation NOT to add something outranks another rule.
- Symmetric burden of proof on adding AND removing; ties → the reversible default.
- Closed confidence tiers (CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION); every unresolved item carries its settling check — "unclear" alone is unacceptable.
- Multi-phase plans state per-phase why each precedes the next.
- Lane disagreements are adjudicated **claim-by-claim with a named root-cause — never by model rank**; corrections from any tier are hypotheses to re-verify.

(The generalized, project-agnostic form of these rules is the global `Reasoning & verification floor` — the brief restates them as *pipeline calibration*, with the numeric bounds and file conventions the global floor deliberately omits.)

### 4.4 Output discipline
1. Durable artifacts first — named files, not chat dumps.
2. Chat reply = bounded digest (default ≤25 lines unless the brief says otherwise).
3. Ruling labels on every resolved question in the artifact.
4. Single top-priority closer a time-constrained reader can act on alone.

### 4.5 Residual risk
Every deliverable set ends with: the **specific checkable trigger** that would flip each judgment (not generic hedging) + an explicit **decided-now vs deferred-to-owner** split.

### 4.6 Brief skeleton

```markdown
# FABLE-5 BRIEF — <topic> (<date>)

You are the mastermind synthesizer (<model string from fable-synth.md>), spawned once over finished
prep. Synthesize; do not redo. Spot-verify load-bearing claims against live code.

Repo: `/Users/marcelspatz/YURI-OS-MUSUBI` (main). Operator: Marcel.

## READ FIRST
1. <prep artifact paths>

## DELIVERABLES (write all; digest-only in reply)
1. <exact output path> — <what>

## OUTPUT DISCIPLINE
- Decisive ruling, not a menu. Ruling labels + confidence tiers.
- Residual-risk flip-triggers + decided-now/deferred split.
- End reply with ≤25-line digest.
```

---

## 5. Prior passes

Six mastermind passes documented under `02_RESOURCES/RESEARCH/`:

| Pass | Date | Domain | Primary outputs |
|---|---|---|---|
| 1 — Role synthesis | 2026-07-05 | Yuri assistant role + solid-minimal setup | `yuri-assistant-role-synthesis-2026-07-05/FABLE-PASS-1-SYNTHESIS.md`, `FABLE-PASS-2-RATIONALE.md` |
| 2 — Global CLAUDE.md lean fix | 2026-07-05 | Same wave, deliverable 2 | Lean global file; stopped @-pulling the YURI spine into every session |
| 3 — Full logic inspection | 2026-07-06 | Opus-fleet / MURE honesty patch-set | `yuri-full-logic-inspection-2026-07-06/01-FABLE-MASTERMIND-VERDICT.md` |
| 4 — Structural + security audit | 2026-07-06 | De-bloat + security hardening | `yuri-structural-security-audit-2026-07-06/FABLE-AUDIT-SYNTHESIS.md` |
| 5 — Code-fix commits | 2026-07-06 | Post-audit execution | `git show 18322046`, `git show 1889cc83` |
| 6 — Global-file evolution + this protocol | 2026-07-07 | Reasoning floor into global CLAUDE.md/persona; MURE fan-out + final synthesis | `global-claude-md-fable5-evolution-2026-07-07/` (candidates, rationale, graph ruling, this doc) |

**Methodology source of truth:** `prep-A-fable-methodology.md` (Rules 1–8, cited); generalized floor: `.claude/CLAUDE.md` → "Reasoning & verification floor". If a seventh earlier pass surfaces, append the row — do not renumber the rules.

---

## 6. Orchestrator checklist

**Pre-spawn:** prep artifacts exist at named paths · brief written (deliverables, READ FIRST, output discipline) · `fable-synth.md` frontmatter carries the intended model (fable-5 while available; opus-4-8 after) · provider auth unblocked · critique lanes flagged for post-mastermind claim-by-claim adjudication, not pre-concession.

**Post-return:** orchestrator spot-checks load-bearing claims (bidirectional re-verify — a mastermind correction is also a hypothesis) · owner approves before candidates go live · residual-risk flip-triggers tracked for whatever was deferred.

---

## 7. Residual risk (this doc)

| Judgment | Flip trigger |
|---|---|
| `anthropic/claude-fable-5` is today-only; opus-4-8 is the durable stand-in | Anthropic extends or productizes the model → keep `fable-synth.md` pointed at it and strike the ephemeral note here. Settling check: does the model string still resolve on next spawn? |
| Custom-agent dispatch remains the >9-model bypass | OMP changes agent discovery or drops per-agent `model:` frontmatter → re-verify against the task executor before next spawn. |
| Historical MURE roster counts (20 roles / 21 files / 4 providers) | Active roster edits under `_SYSTEM/mure/agents/` or `_SYSTEM/mure/agent-catalog.json` → recount before citing; this row snapshots 2026-07-07. |
| Brief skeleton's ≤25-line digest default | A pass whose adjudication genuinely needs a longer digest → the brief overrides; the bound is a default, not doctrine. |

`00FB_FABLE5_PROTOCOL_CANONICAL_X_PASS_COMMITTED`
