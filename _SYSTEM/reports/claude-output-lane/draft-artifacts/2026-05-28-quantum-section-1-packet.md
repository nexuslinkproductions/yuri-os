# Quantum Rick Packet — Conservative State Flows, Section 1 (Premise)

**Status:** draft, awaiting dispatch
**Drafted by:** Claude (main thread)
**Target lane:** Quantum Rick via active tmux lane
**Dispatch command (when ready):**
```bash
node _SYSTEM/Scripts/rick-tmux-lanes.mjs feed quantum \
  --prompt-file _SYSTEM/reports/claude-output-lane/draft-artifacts/2026-05-28-quantum-section-1-packet.md \
  --execute
```

---

## CLAUDE CONTROL PACKET

### Goal

Produce Section 1 (Premise) of the methodology paper *Conservative State Flows: Lyapunov-Gated Promotion as an Extension of ICM/MWP Containment Methodology*. Section 1 sets up the paper by recapping Jake Van Clief's ICM (Interpretable Context Methodology) and MWP (Model Workspace Protocol) frameworks, naming what they solve elegantly, and posing the question the paper will answer in Sections 2–6.

### Target files

- **Write:** `_SYSTEM/reports/energy-landscape-paper-2026-07/section-1-premise.md`
- **Do not modify:** any other paper section, the brief, the ground-truth audit, the math substrate, or YURI control-plane files.

### Constraints

- **Word count:** 280–320 words. Aim for ~300. The full paper budget is ~3,000 words; Section 1 must not eat more than 10%.
- **Voice:** academic-adjacent but operator-readable. Not LinkedIn flavor, not arXiv-stiff. Closer to Jake Van Clief's "Clief Notes" Substack tone — direct, declarative, no preamble.
- **Citations:** at least one explicit reference to Jake Van Clief's ICM/MWP work (arXiv 2603.16021). Reference must be inline in the prose, not relegated to a footnote.
- **No first-person plural ("we") in Section 1.** Save "we propose" framing for Section 3. Section 1 introduces the field and the gap from the outside.
- **No mention of YURI, yuri-energy, Lyapunov, or any solution mechanism.** Section 1 is the *premise* only. The gap is named in Section 2. The proposal lands in Section 3.
- **Peer-lane voice when discussing ICM/MWP:** describe what the methodology *solves* and what it *does not yet formalize*. Frame the gap as a natural extension opportunity, not as a deficiency in Jake's work.
- **No brittle wording:** avoid specific counts, hash-pinned references, or single-incident citations. Cite the methodology, the published artifact, and the operating principle — nothing that could age into staleness.

### Acceptance criteria

1. Word count is 280–320 (inclusive). `wc -w` on the output file.
2. The string `2603.16021` appears at least once (the arXiv ID for Jake's paper).
3. The string `ICM` appears at least three times.
4. The string `MWP` appears at least twice.
5. The strings `Lyapunov`, `YURI`, `yuri-energy`, `energy landscape`, `conservative vector field`, `gradient` do NOT appear (premise section only — solution mechanism is forbidden here).
6. The string `Van Clief` (or `Jake Van Clief`) appears at least once.
7. The section closes with a question — the question Sections 2–6 will answer. The closing sentence must end with `?`.
8. No first-person plural pronouns (`we`, `our`, `us`). Grep `\b(we|our|us)\b` must return zero matches.

### Test command

```bash
F=_SYSTEM/reports/energy-landscape-paper-2026-07/section-1-premise.md
WC=$(wc -w < "$F" | tr -d ' ')
[ "$WC" -ge 280 ] && [ "$WC" -le 320 ] && echo "PASS word-count=$WC" || echo "FAIL word-count=$WC"
grep -c '2603.16021' "$F"
grep -c 'ICM' "$F"
grep -c 'MWP' "$F"
grep -c 'Van Clief' "$F"
grep -ciE '\b(Lyapunov|YURI|yuri-energy|energy[- ]landscape|conservative[- ]vector[- ]field|gradient)\b' "$F" \
  && echo "FAIL: solution mechanism leaked into premise" \
  || echo "PASS: no solution-mechanism leak"
grep -ciE '\b(we|our|us)\b' "$F" \
  && echo "FAIL: first-person plural present" \
  || echo "PASS: no first-person plural"
tail -c 200 "$F" | grep -q '?$' && echo "PASS closes-with-question" || echo "FAIL closes-with-question"
```

All eight checks must pass.

### Rollback boundary

Single file. If the output fails acceptance, delete the file and re-dispatch with refined constraints:
```bash
rm _SYSTEM/reports/energy-landscape-paper-2026-07/section-1-premise.md
```
No other files should be touched by Quantum during this task. If Quantum modifies anything else, that is a scope violation — flag it as an integration finding in the response.

### Route-plan classification

- `lane: quantum-rick`
- `scenario: paper-section-draft`
- `tier: focused-implementation`
- `qualityGate: main-session-review` (Claude main reviews before any further sections proceed)
- `codexPolicy: optional-final-pass` (Codex review is welcome but not required for Section 1; Section 4 and Section 5 will require it)

### GitNexus impact

Not applicable — prose file, no symbol edits.

### Verification before merge or promotion

After Quantum writes the file, Claude main:

1. Runs the eight test commands above.
2. Reads the prose end-to-end for: peer-lane voice, no overclaim, natural opening, question-shaped close.
3. Confirms the section makes the gap *implicit* — a reader should finish Section 1 feeling that "something is missing" without that missing piece being named. Section 2 names it.
4. Reports integration findings (if any) using peer-lane neutral language: "current draft has X", "outside scope: Y", not "Quantum missed Z".

### Source material available to Quantum

The active context packet `energy-landscape-paper` auto-loads:

- `_SYSTEM/reports/YURI_GROUND_TRUTH_AUDIT_2026-05-28.md` — for YURI scope grounding (but YURI is NOT mentioned in Section 1)
- `_SYSTEM/reports/claude-output-lane/draft-artifacts/2026-05-28-jan-brief-energy-landscape-paper.md` — the brief defining paper scope and tone
- `_SYSTEM/Scripts/math/yuri-energy.mjs` — reference implementation (not cited in Section 1)
- `_SYSTEM/research-archive/yuri-math-engine-2026-05/04_mathematical_operating_substrate.md` — substrate doctrine (not cited in Section 1)

For Jake's ICM/MWP, Quantum should NOT attempt to fetch arXiv 2603.16021 directly. Cite it by arXiv ID and describe ICM/MWP at the level the brief and the ground-truth audit summarize: folder-structure-as-architecture, numbered stages, markdown-driven context-per-stage, scoped credentials, sandboxed environments, "treat AI like code, not a colleague."

### Adversarial verification (Quantum self-checks before reporting done)

Per `skills/adversarial-verification/SKILL.md`, before claiming the section is ready Quantum should:

1. Name two likely failure modes for this draft. Common candidates: (a) drifted into solution territory (mentioned Lyapunov), (b) word count too long, (c) tone too academic for Jake's audience, (d) accidentally introduced "we" voice.
2. Run the eight tests in the test command block.
3. Re-read the closing sentence — does it actually pose a question that Section 2 can answer? If not, rewrite the closing.
4. State residual risk explicitly in the response.

### What Quantum returns

A single message containing:

1. Confirmation the file was written at the target path.
2. Output of the eight test commands.
3. Two named failure modes considered + verification result.
4. Residual risk statement.
5. Any integration findings (peer-lane neutral voice).

Do not return the full prose in the response — it's in the file. Main thread reads the file directly after Quantum reports done.

---

## Notes for Marcel (not in the packet)

- This packet is ready to dispatch. The dispatch command is at the top.
- Quantum lane status check first: `node _SYSTEM/Scripts/rick-tmux-lanes.mjs status`
- If Quantum is not currently attached, the lane needs to be brought up before dispatch.
- Expected turnaround: 5-15 minutes depending on Quantum's lane responsiveness and any iteration on the constraints.
- Section 2 (Gap) packet will be drafted after Section 1 lands and passes review. Sections 1-3 are scheduled for Week 2 of the sprint (Jun 4 – Jun 10).
- I have NOT created the target directory `_SYSTEM/reports/energy-landscape-paper-2026-07/` yet — Quantum will create it on first write. If you'd rather I pre-create it with a README, say so.
