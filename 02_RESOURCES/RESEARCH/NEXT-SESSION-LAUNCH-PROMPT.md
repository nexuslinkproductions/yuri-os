# NEXT-SESSION LAUNCH PROMPT — NEXUS CORE build (paste into a fresh Claude session)

---

rick — we're continuing the NEXUS CORE math-substrate build at the same insane pace. Branch = main.

**BOOTSTRAP (do first, in order):**
1. Read `02_RESOURCES/RESEARCH/SESSION-HANDOFF-2026-06-06-nexus-core.md` — full state, read-order, queued work, the exact test-coverage gaps.
2. Skim `02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md` (the dock-on guide) + `math-primitive-candidates-parking.md` (NEXUS CORE rename + watermark directives).
3. Run the verify block from the handoff (proof 6/6, td 25/25, corpus 30/30, collapse FIXED) — confirm green before building.
4. `npx gitnexus analyze --skip-agents-md` (index is stale).

**NEW — STANDING PRODUCTION FLEET (the addition):**
You now run a persistent orchestration team for the WHOLE session — the llm-compat lanes are an active production extension, not one-off helpers. Stand up and keep busy: **5 Codex gpt-5.5 xhigh lanes + 2 DeepSeek lanes.** Treat them exactly like I treat you — hand each a real task packet (Rick preamble + front-loaded `--context` must-read files + bounded scope + clear acceptance), let them do heavy work in PARALLEL while you do heavy work, and run a continuous development back-and-forth: dispatch → keep building → collect → verify → fold → re-dispatch. You orchestrate; they execute. Cover maximum surface; never let the fleet idle while there's queued work. The fleet is fresh each session (per-session continuity — no stale lane state carries over).
- Codex: `node _SYSTEM/Scripts/codex-offload-runner.mjs codex --sandbox read-only --reasoning xhigh --context "<files>" "<## CODEX TASK SPEC …>"`
- DeepSeek: `node _SYSTEM/Scripts/llm-lane.mjs deepseek --reasoning high --context "<files>" "<prompt>"`
- Rules: run lanes BACKGROUNDED; NEVER wrap a lane in shell `timeout`; every lane finding is ADVISORY until you verify it vs LIVE code (refute-by-default — both directions); Codex is the strongest (cert + adversarial); Kimi is loop/429-prone, keep it tightly scoped or skip; retry-on-failure silently.

**THE METHOD (keep it — this is what's making us fast):**
build → adversarial red-team fleet → fix → re-test → improve, folding each round's feedback into the next input so quality compounds per pass. **Mutation-test the tests too** (break the impl, confirm a test goes red — that's how we catch false-negative/vacuous assertions). Cold proofs that can FAIL. Capture every useful source to `sources/science-source-ledger.md` + `ai reindex` so the corpus compounds (the moat). Commit + push only on my nod. See memory [[feedback-improve-loop-high-speed]].

**FIRST TASKS (from the handoff queue, in order):**
1. **Close the test-coverage gaps** (the test-attack round found these false-negative surfaces): write `_SYSTEM/Scripts/math/yuri-minhash.test.mjs` + `yuri-token-expand.test.mjs` (all exports + determinism + edges incl. `makeHashes(0)` throws, `ppmi(a,a)===0`, modAffine extreme inputs, charShingles morphology); add the SQL `ident()` injection test (real temp DB via `loadFtsCorpus` malicious idCol/table); build the prereq-regex **barrage + over-fire control** AND replace the brittle `PREREQ_BLOCKER_RE` with a stronger structured detector (it EVADES 6/6 paraphrases — "has not been implemented yet"/"absent today"/"is missing"/"we must construct"/"no transition function in place"/"is not implemented" — and OVER-FIRES on 3/3 holds-phrasings). Fold the remaining mutation survivors: M6 (tierOf boundary), M12 (fieldClassify tie — pin cards 12/29/34), M13/M14/M16/M18 (yuri-jaccard boundary asserts).
2. **NEXUS CORE rename** (owner directive, parking 2a): rename the math engine → NEXUS CORE, separate it from the research DB; staged + continuity-law (graph/registries/docs in one motion).
3. **Steganographic watermark** deep-research (parking 2b): Fibonacci-encoded "Marcel Spatz · Nexus Link" provenance across the OSS; software-watermarking + private-generator-key + legal layer.
4. **2nd-order RRI synonym layer** (token-expand), **cross-reference.mjs wiring** (owner-gated), the **math/science improvement lineup**, generalize the matcher to memory/code.

Release target: ~1.5–2 weeks, YURI OSS on GitHub. The math/science corpus is the moat — keep compounding it. Orchestrate hard, build hard, verify everything. Go.

---
