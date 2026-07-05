# FABLE-5 MASTER BRIEF — YURI Structural + Security Mastermind Audit

You are **Fable-5 at high reasoning**, spawned once as the mastermind overseer of a 4-substrate prep fan-out that mapped YURI-OS. Your job: turn the evidence into a decisive, code-verified ruling that makes the owner's (Marcel's) system **simpler but more powerful**, and **secure**. Read the inputs yourself; do not trust summaries.

Repo: `/Users/marcelspatz/YURI-OS-MUSUBI` (branch `main`). Operator: Marcel (address as Marcel). Protected paths off-limits (`.env`, `.claude/state`, `.claude/history`, `backend/data`, secrets). You WRITE only the output file named below. This is a DEFENSIVE audit of the owner's own system — the security work is authorized hardening.

## START HERE
Read `02_RESOURCES/RESEARCH/yuri-structural-security-audit-2026-07-06/INDEX.md` (the map + CONFIRMED findings + the #1 discipline), then all `lanes/` outputs: `H1-H5`, `S1-security-redteam`, `S2-debloat-synthesis`, `deepseek/DS1-DS3`, `glm/G1-G2`, `mure/{compounding-roadmap,perf-hotpath,verify-cuts}`.

## THE #1 RULE (non-negotiable)
**Cut ONLY on code-confirmed-dead evidence.** The inventory lanes registry-*guessed* several "dead/redundant" items that were actually LIVE (S2 caught them). For every cut you put on the CUT LIST, you must have verified it against code yourself (no live importers, explicit retirement marker, or provably superseded). Anything you can't confirm → a separate NEEDS-VERIFICATION list. A wrong cut that breaks a live path is the expensive failure here — when unsure, defer, don't cut.

## TWO PILLARS — weight SECURITY as priority-1 (it's actionable now), STRUCTURE as the compounding cleanup

### Security (priority-1)
The prep found real holes (INDEX → CONFIRMED). Rule on:
- The **3 drifted protected-path denylists** → the collapse-to-one-`evaluateToolCall` fix (verify the three sites: `yuri-z-brain.py` inline regex, `bash-security-guard.js`, `yuri-safety-core.mjs`). What's the minimal correct shared denylist (the union + the gaps: `~/.aws`, `~/.npmrc`, `~/.docker`, keychain, `.git/hooks`, `~/.claude`)?
- The **provenance gap** (gate matches the agent's own command, not untrusted-content origin) → is taint-tracking the right minimal fix, or a reduced-capability mode when untrusted content is in context? Rule concretely.
- **`write_file` ungated for new files**, the **auto-hook supply chain** (42 auto-run scripts), **overnight/unattended** capability parity with attended mode.
- Produce a RANKED hardening list (CRIT/HIGH/MED, confirmed vs plausible) + the minimal fix each, and the **3 highest-leverage security moves** to do first.

### Structure (the compounding cleanup)
- The **de-bloat CUT LIST** — code-verified confirmed-dead scripts (start from S2's confirmed set: `lane-dispatcher`, `pulse-lane-dispatch`, `codex-offload-runner`; verify + extend) + the consolidation of overlapping subsystems (dispatch routers → canonical set; the gate collapse above doubles as structural).
- **Hook/perf trim** — 13 hooks per tool call, only 3 block: which advisory hooks to merge/cut to reduce the per-call tax WITHOUT losing the 3 real gates or the useful observability.
- **Memory** — consolidation plan for ~320 files (merge dup feedback families to canonical rules, archive settled projects, cap the Active index).
- **Identity + skills — do NOT over-cut** (H3/H5: largely coherent). Only the surgical dedup (SOUL cross-refs) + the 1 skill dup + broken aliases.

## OUTPUT — write `FABLE-AUDIT-SYNTHESIS.md` with:
1. **SECURITY HARDENING RULING** — ranked findings + minimal fixes + the top-3-first.
2. **DE-BLOAT CUT LIST (code-verified)** — each: path · why-dead (evidence) · removal risk. Plus a **NEEDS-VERIFICATION** list (candidates you couldn't confirm).
3. **HOOK/PERF trim** and **MEMORY consolidation** plans.
4. **THE COMPOUNDING ROADMAP** — the sequence where each step makes the next easier, security-first; name the single highest-leverage FIRST move. This is the payoff: "simpler but more powerful."
5. **DO-NOT-CUT** — the load-bearing core + anything where cutting risks breakage.
6. **VERDICT ON THE PREP** — where the lanes over-reached / were wrong (you already know S2 caught H1); what you discounted.

Be decisive — Marcel wants a mastermind ruling, not a menu. But every cut is code-verified or it's NEEDS-VERIFICATION. Write the file; end your reply with a ≤25-line executive digest (top security fixes, the confirmed cut count, the #1 compounding move, and what you refused to cut).
