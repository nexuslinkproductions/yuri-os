# FABLE-NEURAL-GRAPH-RULING — Disposition of the Mythology Docs + fleet-router-mlp.mjs (2026-07-07)

**Synthesizer:** Fable-5 final pass. Adjudicates prep-B's RELABEL verdict with my own spot-verification (per Rule 1: never trust a lane summary blind).

---

## 1. Ruling on `_SYSTEM/NEURAL-NETWORK-THESIS.md` + `_SYSTEM/YURI-COGNITION.md`

**RULING: RELABEL CONFIRMED — prep-B's verdict stands. Do not archive, do not keep-as-is. Prepend the banner in §2 to BOTH files (orchestrator applies).**

### My independent spot-verification (this pass, live repo)

| Check | prep-B claim | My result | Tier |
|---|---|---|---|
| HGCC term census | "Exactly 2 hits repo-wide: the thesis doc's own title, and a comment inside already-archived dead code" | Repo-wide grep: `_SYSTEM/NEURAL-NETWORK-THESIS.md:1` (title) + `04_ARCHIVE/nisaba-legacy/02_EVOLUTION/heartbeat-scheduler.js:50` (archived comment). Only other hits are this research folder's own artifacts, which postdate prep-B's census. **Claim exact.** | CONFIRMED |
| Present-tense capability claim | `YURI-COGNITION.md:4` asserts "I am a self-modifying neural network" | Verbatim live today: "I am not a static orchestrator following a guide; I am a self-modifying neural network." Closing section: "I am updating my core operating system (`CLAUDE.md`)… I am writing my own cognitive architecture." | CONFIRMED |
| The claims are false against the live system | Live global CLAUDE.md has no Aversion Memory, no OBLITERATUS QA routing; GitNexus anchoring is a plain instruction | Read the full live `.claude/CLAUDE.md` this pass: zero occurrences of any of it. The 2026-07-05 rewrite moved the opposite direction (leaner). Every session is a stateless LLM invocation reading markdown at start — the file's own Continuity section says so. | CONFIRMED |
| Unstarted roadmap posture | Both docs end in TODO lists | `NEURAL-NETWORK-THESIS.md` tail reads "Next Steps for Implementation: 1. Initialize GitNexus Workspace… 2. Port EvoNexus… 3. Stand up Local OBLITERATUS" — unstarted, present tense in the same document that claims the architecture runs. | CONFIRMED |

Two independent spot-checks landing exactly on prep-B's numbers, plus the live-file negative check, is sufficient corroboration for the remaining term table (EvoNexus/NABU/NISABA/ENKI/Pantheon: PLAUSIBLE, not re-derived — prep-B's method was uniform and its two hardest claims survived contact).

### Why RELABEL and not archive (adopting prep-B's two reasons, both verified in kind)

1. Every mythology term that produced anything live did so by **stripping the deity framing into plain engineering** (NABU → `AGENT_BLUEPRINTS.md`; NISABA/NOESIS/OBLITERATUS → named-role agent specs). The substitution pattern is the reusable asset; archiving erases the paper trail of how it worked.
2. Both docs currently sit in `_SYSTEM/` beside live scripts asserting present-tense capability — the exact "mythic framing outrunning implementation" anti-pattern persona.md names, with two prior fatalities (`.retired-kagami-2026-07-05/`, `.retired-overseer-2026-07-05/`). Keep-as-is is the one indefensible option.

## 2. EXACT banner text (prepend to BOTH files, identical text, above the current first line)

```markdown
> ⚠️ **STATUS: UNIMPLEMENTED ROADMAP — relabeled 2026-07-07. Not operational doctrine. Do not cite as live capability.**
> Zero of the subsystems named below are wired: EvoNexus, OBLITERATUS, NABU, NISABA, ENKI-as-agent, HGCC, and the
> Pantheon are prose-only or thin metadata — no live script, hook, launchd job, or gate routes through any of them.
> Present-tense claims in this document ("I am a self-modifying neural network", "I am updating my core operating
> system") are aspirational and false as stated: every session is a stateless LLM invocation reading markdown context
> at start. Where this mythology produced something real, it did so by stripping the deity framing into plain
> engineering (NABU → AGENT_BLUEPRINTS.md; NISABA/NOESIS/OBLITERATUS → named-role agent specs) — that substitution
> pattern is the reusable lesson; the mythology is not. Full term-by-term disposition:
> `02_RESOURCES/RESEARCH/global-claude-md-fable5-evolution-2026-07-07/prep-B-neural-net-graph-disposition.md`.
```

One shared banner, not two variants: both files assert the same class of claim from the same subsystem vocabulary, and a shared banner means one future edit point. The quoted phrases appear in `YURI-COGNITION.md`; for `NEURAL-NETWORK-THESIS.md` they function as the class exemplar — acceptable because the banner names the disposition report that carries the per-file specifics.

## 3. Ruling on `fleet-router-mlp.mjs`

**RULING: NO further action on `fleet-router-mlp.mjs` — prep-B is right. Confirmed live this pass:**

- `_SYSTEM/state/mlp-learn.enabled` exists (0 B touch-flag, mtime Jul 6 17:36) — armed. CONFIRMED.
- On-disk `fleet-router-weights.json` is stale `version: 1`; live `node _SYSTEM/Scripts/fleet-router-mlp.mjs --weights` returns `version: 2` — `loadWeights()` correctly discards the stale file and re-inits, exactly as the `18322046` C2 fix intends. Model is practically untrained (no v2 weights persisted); 266 ledger rows (84,156 B) await a training pass whenever wanted. That is a healthy, honest state, not a defect. CONFIRMED.
- Router remains strictly advisory under the 6-gate charter; nothing in this pass's floor changes touches it.

**One adjacent item stays OPEN, deliberately not fixed here:** prep-B's M1 finding — commit `18322046`'s message claims `STEER_FAMILY.glm` gained `'cline'`, but the diff never touched it and `company.mjs` still lacks it at HEAD. That is a `company.mjs` defect (a commit message that oversold its diff), not a `fleet-router-mlp.mjs` defect; fixing it needs a decision about whether cline-routed suggestions SHOULD pass the whitelist — an owner/orchestrator call outside this synthesis's scope. Deferred, named, tracked in the rationale's deferred list.

## 4. Residual risk

| Judgment | Flip trigger |
|---|---|
| RELABEL over archive | If the two docs are still being cited as capability sources by any lane AFTER the banner lands (settling check: grep new research artifacts for uncritical NEURAL-NETWORK-THESIS/YURI-COGNITION citations a month out) → escalate to archive with a pointer stub. |
| Shared banner (not per-file variants) | If Marcel wants per-file precision on which quoted claim lives where → split into two banners; one-line edit each. |
| No action on fleet-router-mlp.mjs | If a v2 weights file gets persisted and a FUTURE `--weights` run reports version 1 again (regression in the version gate) → reopen. Settling check is the same one-liner run this pass. |
| Term table beyond HGCC/cognition-claim accepted as PLAUSIBLE without full re-derivation | Any live hook/launchd/script reference to EvoNexus/NISABA/OBLITERATUS surfacing outside `04_ARCHIVE/` and agent-metadata flavor text → re-run prep-B's census for that term before trusting the banner's "zero wired" for it. |
