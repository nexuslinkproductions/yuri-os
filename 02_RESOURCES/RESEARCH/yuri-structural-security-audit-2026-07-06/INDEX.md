# YURI Structural + Security Audit — Prep Package INDEX (2026-07-06)

Prepared by the main Claude/Opus session via a 4-substrate fan-out (5 Haiku inventory + 2 Sonnet deep-analysis native Agents · 3 deepseek-flash breadth lanes · 2 GLM blind-peer lanes · MURE armed full-dispatch). Input to ONE Fable-5 mastermind pass. Nothing here is executed — it is the evidence map Fable cuts from.

## The mission
Make YURI-OS + Yuri-as-agent **simpler but more powerful** — a code-verified de-bloat cut list + real security hardening + a compounding-simplification roadmap. Scale that triggered this: **~594 scripts, 44 hooks (13 per tool call), 107 skills, ~320 memory files, ~404-line identity layer/session, a regex confirm-gate.**

## Lane outputs (all under `lanes/`)
**Native inventory (Haiku):** `H1-scripts-liveness.md` · `H2-hooks-audit.md` · `H3-skills-coherence.md` · `H4-memory-sprawl.md` · `H5-identity-overlap.md`
**Native deep (Sonnet):** `S1-security-redteam.md` · `S2-debloat-synthesis.md`
**Deepseek breadth (cited/advisory):** `deepseek/DS1-agent-security-taxonomy.md` · `DS2-debloat-methods.md` · `DS3-minimal-safe-autonomy.md`
**GLM blind peers (divergence signal):** `glm/G1-blind-cut-and-harden.md` · `glm/G2-blind-compounding-simplification.md`
**MURE armed leaves:** `mure/compounding-roadmap.md` · `mure/perf-hotpath.md` · `mure/verify-cuts.md` (its structural-debloat leaf came back malformed — covered by S2).

## CONFIRMED (multiple lanes, code-verified) — Fable can build on these
- **SECURITY — 3 drifted protected-path denylists.** The voice brain (`yuri-z-brain.py`) runs as a standalone HTTP server OUTSIDE the Claude Code hook chain; its inline regex denylist, `bash-security-guard.js`, and the fleet's `yuri-safety-core.mjs` `evaluateToolCall` are three separate lists that have drifted (brain misses `~/.aws`/`~/.npmrc`/`~/.docker`/keychain; fleet misses `.git/hooks`, `~/.claude` outside repo). `read_doc` (just shipped) reads absolute paths. **S1 + S2 both confirmed. Top fix: collapse onto ONE `evaluateToolCall`.**
- **SECURITY — provenance gap.** The confirm-gate classifies by the agent's OWN command string, not by whether UNTRUSTED content (a crafted PDF via `read_doc`, fetched web text in fleet lanes) drove it → indirect-prompt-injection-to-critical-action. `write_file` is ungated for brand-new files (only overwrites gate).
- **HOOKS — only 3 of 44 actually block** (bash-security-guard, yuri-risk-lite, math-register-guard); 41 advisory; energy-enforce DISARMED. The `missing-control-packet` WARN is confirmed advisory noise (no deny path).
- **DEAD scripts (code-verified by S2):** `lane-dispatcher.mjs` (zero live refs), `pulse-lane-dispatch.mjs`, `codex-offload-runner.mjs` (explicit retirement markers).
- **MEMORY:** ~320 files, 23-35 semantic dups across ~4 feedback families, MEMORY.md over its injection cap.
- **COHERENT — do NOT over-cut:** skills (H3: only 1 real dup tdd/test-driven; broken alias cgs-mold; otherwise 7 clean subsystems) and the identity layer (H5: 15 overlaps but ZERO contradictions — keep 3-file separation + surgical dedup, each file carries distinct irreplaceable value).

## THE #1 DISCIPLINE FOR FABLE (the meta-signal)
**Cut ONLY on code-confirmed-dead evidence.** S2 caught H1 registry-*guessing* dead/redundant items that were actually LIVE (the "3 redundant memory bridges" are 3 distinct seams; some "orphans" are imported by live paths; some claimed files don't exist). S1 caught the main session over-claiming `screen-context /act` as a live tool (it's not wired). Every cut candidate must be re-verified against code; unverified → NEEDS-VERIFICATION, never cut.

## Fable mandate → `FABLE-AUDIT-BRIEF.md`
Outputs: `FABLE-AUDIT-SYNTHESIS.md` — (1) security hardening rulings (priority-1, actionable), (2) the code-verified de-bloat CUT LIST + a NEEDS-VERIFICATION list, (3) hook/perf trim, (4) memory/identity/skills light consolidation, (5) the COMPOUNDING roadmap (sequenced, highest-leverage-first, "simpler but more powerful"), (6) the do-NOT-cut load-bearing core.
