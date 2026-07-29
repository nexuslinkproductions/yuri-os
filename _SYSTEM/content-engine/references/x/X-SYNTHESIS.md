# X (Twitter) — how the AI-dev authority tier writes (synthesis, 2026-07-29)

Method: public-profile harvest (no login) of 6 accounts Marcel's niche reads:
karpathy (3.5M), rauchg (723k), theo (366k), mckaywrigley (228k), simonw
(201k), swyx (178k). Sampled their latest 5 posts each, verbatim below in
spirit; patterns extracted per account, then cross-account.

Headline finding: **at the authority tier, nobody uses CTAs.** Zero
"comment X", zero "follow for more", zero questions to the audience. The
asset speaks. Marcel's no-CTA rule is confirmed correct for the tier he's
aiming at — the jlee funnel is the growth-hack tier below it.

---

## Per-account patterns

### karpathy — the professor in lowercase
- Long essay-posts on ONE idea, fully reasoned ("One pattern I find useful
  for working with LLMs is a nice long ramble session...").
- Issues QUALITATIVE verdicts as authority: "*qualitatively* also, this is a
  major-version-bump-deserving step change". Not benchmarks, taste.
- Personal updates stripped of theater ("Personal update: I've joined
  Anthropic.") → 150k likes.
- Move to steal: the considered verdict. Test a thing for a week, then rule
  on it in public. Marcel already does the seed of this ("so far its great");
  the karpathy version adds the reasoning.

### swyx — the aphorist/market reader
- Aphorism lists with `>` ("Systems > Goals / Writing > Reading").
- Market structure reads with a coined frame ("bull market for AI-native
  ICs, bear market for heads of X", "agent lab thesis").
- Corrects the metric everyone uses ("$ per token died... $/task").
- Move to steal: the coin. Name a pattern once, keep using it. Marcel's
  candidates: the grep tax, the honesty gate, "built to say no".

### simonw — the diarist of record
- TIL culture: small exact thing learned, with link and exact numbers
  ("1618 in sqlite-utils alone").
- Asks the sharp question in public, as a reader not a performer ("I'd love
  to know more about the unsecured sandbox...").
- Never hype. "This is detailed, fascinating and answers all sorts of open
  questions" is his maximum excitement.
- Move to steal: document small exact learnings. Fits the "decoding AI" bio
  perfectly: one decoded mechanism per post, with the receipt.

### theo — the builder's changelog
- Metrics-first changelogs ("Reduced data loaded by over 50x. Loading a
  thread now requires ~2% as much data").
- Anti-hype win framing ("I'm sad to report it was 100% worth it").
- One-command pride ("npx t3 connect" as the whole value prop).
- Move to steal: report your own stack's telemetry as content. We have the
  best raw material in the niche (205→0, 1,134,061x, PASS verdicts).

### mckaywrigley — the genuine superlative
- Emotional-but-specific product reactions ("by far the single most
  underrated ai product rn... should be 100x more popular").
- Journey arc credibility ("I couldn't code 18 months ago").
- Usage telemetry as personal data ("80/20 claude/gpt in <3 months").
- Move to steal: the honest model diary. Marcel's limit posts are already
  this genre; extend to "what I ran this week, what held up".

### rauchg — the benchmark authority
- Numbers-table posts (price-performance rankings, exact multipliers:
  "10x cheaper than Sol, 5.7x cheaper than Opus 5").
- tl:DR of papers with a verdict ("container-level isolation is not
  enough").
- Minimal words, maximum information density, filenames in 𝚖𝚘𝚗𝚘.
- Move to steal: run small public benchmarks and post the table. This is
  Marcel's stated love (performance benchmarks, local models) and we own
  the machinery to produce them weekly.

---

## Cross-tier patterns (the reusable set)

1. **Telemetry posts** — real numbers from your own stack, on a rhythm
   (theo, rauchg). Our radar + benchmarks section already produces them.
2. **The coined frame** — name the pattern once, reuse forever (swyx).
   "The grep tax" and "built to say no" are Marcel's.
3. **The decoded mechanism** — one exact mechanism per post, receipt
   attached (simonw). The bio promise.
4. **The considered verdict** — test, then rule (karpathy). Weekly model/
   tool verdicts.
5. **Anti-hype wins** — report successes with a twist of reluctance or
   honesty about cost (theo, jlee's "honest catch"). Credibility engine.
6. **Fast anti-take on fresh news** — react within 24h with the
   non-consensus angle (karpathy on pay-per-use). The radar's 72h window
   exists for this.
7. **No CTAs, no hashtags-as-crutch, no emoji in the post body** (karpathy
   uses 🚀 once per quarter; that's the ceiling).

## How this feeds the quality gate

Every scripted draft now gets scored against this checklist before Marcel
sees it (the gate lives in the content-engine skill):
- [ ] contains ONE of the 7 cross-tier patterns, named in the draft meta
- [ ] one real number or verbatim receipt
- [ ] zero CTA, zero banned forms (em-dash, not-X landing, slop list)
- [ ] decode sentence present (the "what it actually means" line)
- [ ] reads like a person who tested the thing this week, not a summary
      of someone else's post
