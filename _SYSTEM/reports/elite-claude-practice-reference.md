# Elite Claude-Code Practice — Reference (for `ai search`)

Synthesized 2026-06-02 from two research rounds (Boris Cherny, Anthropic teams, Karpathy, Willison, Ronacher, Hashimoto, Varda, Huntley, Yegge + Anthropic docs). Feeds the native-only migration ([native-only-control-plane-plan.md](native-only-control-plane-plan.md)). Patterns below are the durable, adoptable craft — kept here so the corpus compounds.

## Core non-negotiables (cross-validated by every source)
- **Verification is the 2-3x quality multiplier.** "You don't trust; you instrument." Name the machine-checkable check BEFORE the work; "looks done" is not a signal. Escalate the gate: in-prompt check → `/goal` condition re-checked each turn → Stop-hook that blocks turn-end until green → fresh-context refuter. Show command+output, never assert success.
- **TDD / criterion-first** is "the single strongest pattern": write the failing test, COMMIT it as baseline, implement to green, don't let the agent edit the test (commit-baseline detects the cheat).
- **Explore → Plan → Implement → Commit.** Plan mode separates research from execution; hand-edit the plan; persist it; execute in a FRESH clean context. Skip planning only if the diff fits one sentence.
- **Lean always-on context** ("context is RAM"). Anthropic: CLAUDE.md core <200 lines; per-line test "would removing this cause a next-turn mistake? if not, cut it." Bloat makes Claude IGNORE rules. Sometimes-relevant → skills (on-demand); path-specific → `.claude/rules/` with `paths:`.
- **Hooks guarantee, prompts suggest.** Guardrails (protected paths, no-push, no-destructive, format-on-edit, verify-before-done) belong in deterministic hooks; prose is advisory. Convert an oft-ignored rule into a hook, not more prose.
- **Fresh-context reviewer** — the writer never grades its own work; bound it to correctness/requirement gaps (a gap-hunting reviewer over-reports → over-engineering).
- **Small reviewable diffs / leash** (Karpathy: "scared of big diffs"); one increment at a time, verify, commit, next.
- **Skills: progressive disclosure.** Descriptions share a ~2%/16k-char budget; one sharp non-overlapping line each; `disable-model-invocation: true` on manual-only skills (zero cost + no mis-routing); split fat bodies into bundled tier-3 files; ~8-12 always-relevant ceiling.
- **Parallelism = git worktrees + tmux** (Boris's "single biggest unlock"); isolate per independent lane; collision-check before fan-out; `.worktreeinclude` seeds env. Native, no `claude -p`.
- **Harness pruning:** "remove one component at a time, observe, keep only what earns its place"; scaffolding for an older model becomes dead weight after an upgrade — re-test on every model bump.
- **Model + fan-out: intentional per-task self-select**, measured by tokens-to-done, not a floor or a fixed agent cap.
- **CLI tools > MCP for context efficiency**; minimal always-on MCP; tool-search defers schemas. Skills > MCP (Willison) for on-demand capability.
- **Course-correct early; rewind over correcting in-context;** `/clear` between tasks; after 2 failed corrections, `/clear` + sharper prompt.

## Karpathy specifics
- "Vibe coding" = building WITHOUT reading the diff — only for throwaway/low-stakes; never on security/credentials/billing or shared code. He retired the term, reframed as "agentic engineering" with oversight.
- Autonomy slider, default LOW: "Iron Man suit, not Iron Man robot"; "the DECADE of agents, humans in the loop."
- Context engineering > prompt engineering (the window is RAM); give success criteria not step-by-step; watch agents like a hawk for the new failure mode (bloated abstractions, reflexive try/except, dead-code accumulation, deprecated APIs, repo-style drift). Generation ≠ discrimination.

## Pioneer tactics
- Ronacher: reinforce through tool RETURNS (feed status+recovery hints+restated goal each call); logging-as-agent-eyes; write code FOR agent legibility (explicit over magic, long names, plain SQL, fast tools that crash-not-hang, stable deps); Sonnet-default, measure tokens-to-done.
- Hashimoto: race N attempts on isolated worktrees, keep the winner; "always have an agent doing something"; build a test/lint harness for every mistake (verifier, not just a prose rule); frequent commits/jj as save-points; you stay the architect (structure, data flow, where state lives).
- Varda (production OAuth via Claude, NOT vibe): named ground-truth reference cross-checked line-by-line; watch-as-it-writes with instant corrections; pre-loaded checklist of Claude's security anti-patterns (plaintext-not-hash, unnecessary backup keys).
- Huntley "Ralph loop": filesystem-as-memory, deterministic stack reset, one task per iteration, search-before-assuming, tests as backpressure — adopt the ideas, never the unattended infinite loop.

## Anthropic dynamic workflows / ultracode
Claude writes an orchestration script that fans out tens-hundreds of parallel subagents, others refute findings, iterate to convergence (orchestrate → verify → synthesize). For codebase-wide bug hunts, security audits, large migrations. In-session (no headless) — the native, YURI-safe form of swarm.

## Sources
Boris: howborisusesclaudecode.com · pragmaticengineer.com/p/building-claude-code-with-boris-cherny · paddo.dev/blog/how-boris-uses-claude-code
Anthropic: code.claude.com/docs/en/best-practices · claude.com/blog/how-anthropic-teams-use-claude-code · anthropic.com/engineering/effective-context-engineering-for-ai-agents · anthropic.com/engineering/harness-design-long-running-apps · anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills · claude.com/blog/introducing-dynamic-workflows-in-claude-code
Karpathy: Software 3.0 (latent.space/p/s3) · simonwillison.net/2025/Mar/19/vibe-coding · x.com/karpathy/status/1937902205765607626 (context engineering)
Pioneers: lucumr.pocoo.org/2025/6/12/agentic-coding (Ronacher) · simonwillison.net/2025/Sep/30/designing-agentic-loops · ampcode.com/notes/how-to-build-an-agent (Thorsten Ball) · ghuntley.com/ralph · news.ycombinator.com/item?id=44159166 (Varda OAuth)
