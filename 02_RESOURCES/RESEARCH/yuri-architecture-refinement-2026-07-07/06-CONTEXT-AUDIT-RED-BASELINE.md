{
  "deliverable": "Context-budget audit of the 4 always-@-included files",
  "methodology_token_estimates": "No tokenizer (tiktoken/gpt-tokenizer) is installed in the repo env, so token figures are bounded heuristic estimates, stated openly. Two bounds computed for every file: UPPER = chars/4 (dense markdown with backticks, arrows →, em-dashes, and code fragments tokenizes toward the high end), LOWER = words/0.75. For these dense, symbol-heavy docs the true Claude-token count sits in the upper portion of the band, so the tables lead with chars/4 and show the lower bound in parentheses. Char/byte/word/line counts are exact (measured, not estimated).",
  "section_1_token_cost_table": {
    "header": "Per-file token cost (measured bytes/words; tokens estimated, band shown)",
    "columns": [
      "File",
      "Lines",
      "Words",
      "Bytes",
      "Chars",
      "Tokens ~chars/4 (lower bound ~words/0.75)"
    ],
    "rows": [
      [
        "CLAUDE.md",
        198,
        2009,
        15028,
        14918,
        "~3,730 (2,679)"
      ],
      [
        "SOUL.md",
        93,
        1397,
        9535,
        9513,
        "~2,378 (1,863)"
      ],
      [
        "_SYSTEM/persona.md",
        123,
        2435,
        16373,
        16191,
        "~4,048 (3,247)"
      ],
      [
        "_SYSTEM/yuri-origin.md",
        194,
        2370,
        17614,
        17527,
        "~4,382 (3,160)"
      ],
      [
        "COMBINED (permanent context tax)",
        608,
        8211,
        58550,
        58149,
        "~14,537 (10,949)"
      ]
    ],
    "note": "~14.5k upper-bound tokens are injected into EVERY agent session in this repo before the first user message. Roughly half (~7.3k) is identity/persona (SOUL + persona), and those two are largely the same document (see §2)."
  },
  "section_2_redundancy_findings": {
    "A_structural_same_doc_split_in_two": {
      "severity": "CRITICAL — single largest waste",
      "finding": "SOUL.md and persona.md are the same document. persona.md L4 explicitly declares itself the replacement: 'The single brain doc: voice spine + cognitive base + Marcel operating model + binding floor. Loaded natively, read-first, via `CLAUDE.md` (@-include).' SOUL.md is the pre-merge residue that was never deleted. Three independent proofs:",
      "proof_1_six_deferral_pointers": "SOUL.md contains 6 explicit 'See `_SYSTEM/persona.md` → ...' pointers — it is actively deferring to its own successor: L27 (adversarial-ally mechanic), L29 (vulgarity dial-down), L33 (cognitive-workflow non-clinical framing), L37 (monotropic, labelled 'same mechanic, canonical wording'), L41 (polymathic-transfer protocol), L59 (learn-from-correction soft→binding). A document that points to its own replacement 6× is dead weight.",
      "proof_2_near_verbatim_duplicates": "Two SOUL 'Core Truths' are near-verbatim clones of persona entries, measured by normalized word-Jaccard: (a) SOUL L35 'Run divergent scan before convergence' vs persona L54 'Divergent scan before convergence' = 67% overlap; both even end 'Kill clever branches that do not improve the decision.' (b) SOUL L39 'Switch salience deliberately' vs persona L55 'Deliberate salience switching' = 45% overlap; both enumerate the identical set 'breadth, depth, stop, ask, or execute' and both use 'idea spray'/'idea-spray' and 'tunnel'.",
      "proof_3_scope_overlap": "Both cover identity+ cognition+ behavior under the same authority clause ('Behavior only; no operational authority' / 'a behavior layer'). persona.md absorbed SOUL's voice spine, cognitive base, operating model, AND binding floor verbatim.",
      "additional_soul_restatements_of_persona": "SOUL L13 'Skip the \"Great question!\" and \"I'd be happy to help!\"' is a partial restatement of persona L116's fuller anti-patterns list ('\"Great question\" · \"I'd be happy to help\" · \"Certainly!\" · ...'). SOUL L23 'Spend tokens on presence' ≈ persona L102 'Spend words on presence when they carry decoding, texture...'. SOUL L27 'adversarial ally' + SOUL L29 'vulgarity' each restate a concept AND carry a deferral pointer — they describe the rule twice and then point away from it."
    },
    "B_policy_triplicated_across_three_files": {
      "severity": "HIGH",
      "finding": "The Mutation/Commit Contract is stated THREE times, near-verbatim, across three files — and yuri-origin.md L19 forbids exactly this.",
      "location_1_canonical": "yuri-origin.md L40 (the authority): 'Commit AND push the current session's own work directly — no per-task approval gate (git is fully reversible and tracked; owner upgrade 2026-06-14). HARD RAILS: scope to the session's own changed files via explicit pathspec (`git add <paths>` + `git commit -- <paths>`); NEVER `git add .` or a bare `git commit`...'",
      "location_2_adapter_restatement": "CLAUDE.md L170 restates it: 'Commit and push the current session's own work directly — no per-task approval gate (owner upgrade 2026-06-14: git is reversible + tracked). Explicit pathspec only (`git add <paths>` + `git commit -- <paths>`); never `git add .` or a bare `git commit`...' — same date, same pathspec rails, ~95% identical wording.",
      "location_3_persona_restatement": "persona.md L111 restates it a third time inside the binding floor: 'Commit/push the session's OWN work directly — no approval gate... explicit pathspec only, never `git add .` or a bare `git commit`, checks green + `git show --stat` before push, fetch+rebase/ff never force.'",
      "the_smoking_gun": "yuri-origin.md L18-21 governs this directly: 'Shared policy lives once here or in executable contracts. Adapter files may narrow behavior for a surface, but they may not restate shared policy... If two files duplicate the same rule, keep it in the narrowest correct home and delete the duplicate elsewhere.' The contract names its own dedup mandate and the other two files violate it."
    },
    "C_CLAUDE_adapter_restates_origin_policy": {
      "finding": "CLAUDE.md restates four yuri-origin.md sections inline rather than pointing to the canonical home:",
      "item_1_protected_paths": "CLAUDE.md L155-166 (Protected Paths, lists 6 paths) ⊂ yuri-origin.md L46-62 (Protected Surfaces, lists 11+ incl. file-history, projects/*/history, secrets). The adapter copy is an incomplete subset of the canonical list — so it is both redundant AND stale-prone (a new protected path added to origin is invisible to the adapter).",
      "item_2_gitnexus": "CLAUDE.md L191-197 (GitNexus block) restates yuri-origin.md L23-29 (same gitnexus_impact/detect_changes/query/context + HIGH/CRITICAL warn). NUANCE: the CLAUDE block sits inside `<!-- gitnexus:start/end -->` markers and is auto-regenerated by `npx gitnexus analyze`, so it is tool-managed rather than hand-prose — but it is still a pure context-tax duplicate of the origin section and the bare `analyze` re-expands it.",
      "item_3_verification": "CLAUDE.md L114 ('Treat first-run success as a hypothesis, not proof... Claude output stays advisory until local evidence verifies it') and CLAUDE.md L181-189 (Verification: 'attack the result before trusting first-run success', list changed files, tests, risks) duplicate yuri-origin.md L165 ('First-run success is a hypothesis, never proof; hermetic-green ≠ live-correct') and the origin Output Contract L31-36."
    },
    "D_internal_duplication_inside_CLAUDE_md": {
      "finding": "CLAUDE.md repeats itself. (1) The 'advisory until local evidence verifies' rule appears twice within the same file — L76 ('Claude output is advisory until local evidence verifies it') and L114 ('Claude output stays advisory until local evidence verifies it'). (2) The xref-query/propagation-scan invocation is instructed four separate times inside CLAUDE.md: L18, L20, L51-57 (bash blocks), and L122 — same two commands, four homes."
    },
    "E_advisory_until_verified_fan_out": {
      "finding": "The single most-repeated rule across the 4-file set is 'model output is advisory until local evidence verifies it.' Confirmed instances: CLAUDE.md L76, CLAUDE.md L114, yuri-origin.md L128 ('Docked LLM and model output is advisory until deterministic local evidence verifies it'), yuri-origin.md L106 ('Model output is `advisory_only=true`'). Plus conceptual restatements (not verbatim, lower confidence): persona.md L59 ('only verified climbs to fact'), persona.md L88 ('adjudicate claim-by-claim'), SOUL.md L9 ('separate claims from evidence'), SOUL.md L57 ('Handle evidence like an analyst'), SOUL.md L25 ('Truth before polish'). One rule, ~9 surface expressions."
    },
    "F_named_skill_stubs_as_context_tax": {
      "finding": "Five SOUL 'Core Truths' (L45 Izanagi, L47 Haki, L49 Nen, L51 Bankai, L53 Geass) are ~40-word prose paragraphs whose payload is fully owned by their named skills (skill://izanagi-simulator, haki-intent, nen-phase-detector, bankai-manifest, geass-lock). Together they are ~1,717 chars / ~429 tokens of duplicated skill-description sitting in always-loaded context. They describe what the skill does and then the skill loads and describes it again."
    }
  },
  "section_3_trim_proposals": {
    "ordered_by_savings": [
      "Each row: what to cut, the measured footprint, the canonical home that keeps the rule, and the conservative saving (I credit only the dedupe, never the canonical copy).",
      {
        "rank": 1,
        "action": "MERGE SOUL.md into persona.md and drop the `@SOUL.md` include (CLAUDE.md L2). Keep persona.md as canonical identity/behavior doc; fold into it the ~6 SOUL lines with no persona counterpart (L17 resourceful, L19/L21 durability/personality-accumulation → already covered by yuri-origin Memory Architecture Track B, so likely kill; L67 guest-boundary, L73 messaging-boundary, L61 resolve-ambiguity). Delete SOUL.md entirely.",
        "canonical_home": "persona.md (already self-declared 'single brain doc', L4). Origin authority for behavior = yuri-origin.md L18-21 dedup rule.",
        "footprint_removed": "SOUL.md full file = 9,513 chars / ~2,378 tok (upper).",
        "footprint_kept": "~6 merged stub-lines, est ~1,000 chars / ~250 tok.",
        "estimated_saving": "~2,100 tok (upper) / ~1,600 tok (lower bound). Largest single win; removes a whole always-loaded file."
      },
      {
        "rank": 2,
        "action": "Collapse CLAUDE.md Execution Rules L168-175 to a one-line pointer: 'Commit/push + git discipline: see `_SYSTEM/yuri-origin.md` → Mutation Contract.' Keep only the 3 adapter-local bullets that origin does NOT carry (L171 secrets, L173 deps-install-approval, L175 cybersec-labs) — these genuinely narrow behavior for the Claude surface.",
        "canonical_home": "yuri-origin.md L38-44 (Mutation Contract) — it is already the most complete copy and origin L19-21 names it the home.",
        "footprint_removed": "CLAUDE.md L170 restatement = ~701 chars / ~175 tok for the whole 168-175 block; the L170 prose alone ≈ 440 chars / ~110 tok.",
        "estimated_saving": "~110 tok (drop L170 prose), keep the 3 narrowing bullets."
      },
      {
        "rank": 3,
        "action": "persona.md L111 binding-floor 'Safety & mutation' bullet: strip the mutation mechanics (pathspec/no-add/show-stat/rebase) and reduce to the identity lock only ('Never `claude -p`/headless; HIGH/CRITICAL risk → owner approval'). The mutation rails belong to yuri-origin L40.",
        "canonical_home": "yuri-origin.md L40 (Mutation Contract) for the rails; persona L111 keeps only the identity/session-launch lock.",
        "footprint_removed": "persona L111 = 518 chars / ~130 tok; keep ~150 chars / ~38 tok.",
        "estimated_saving": "~90 tok. Closes the triplicate (§2B) — after this + Proposal 2, the contract lives exactly once."
      },
      {
        "rank": 4,
        "action": "Convert the 5 named-skill 'Core Truth' stubs (after SOUL merge, or in persona) into a compact one-line index: 'Named cognitive skills (load on match): Izanagi (simulate 3 branches) · Haki (intent map) · Nen (phase mode) · Bankai (externalize manifest) · Geass (locked constraint).' Each skill already self-describes in its SKILL.md.",
        "canonical_home": "The skills themselves (skill://*). The one-liner index can live in persona.md or CLAUDE.md.",
        "footprint_removed": "5 stubs = 1,717 chars / ~429 tok; replaced by ~1 line ≈ 250 chars / ~62 tok.",
        "estimated_saving": "~370 tok (upper)."
      },
      {
        "rank": 5,
        "action": "Delete CLAUDE.md L155-166 Protected Paths block, replace with 'Protected paths: see `_SYSTEM/yuri-origin.md` → Protected Surfaces (authoritative, full list).' The adapter copy is an incomplete subset and will drift.",
        "canonical_home": "yuri-origin.md L46-62 (full list).",
        "footprint_removed": "213 chars / ~53 tok; keep ~1 pointer line ≈ 90 chars / ~22 tok.",
        "estimated_saving": "~30 tok. Small per-token but removes a drift/staleness hazard (the subset copy cannot see new origin paths)."
      },
      {
        "rank": 6,
        "action": "Dedupe the 'advisory until verified / first-run success is a hypothesis' rule to ONE canonical statement (yuri-origin.md L106 + L128 already hold it) + ONE pointer in CLAUDE.md. Delete CLAUDE.md L114's restatement (the 'adversarial-verification skill' load instruction can stay — that part is adapter-local) and the duplicate L76 line; keep L76 only if it must sit in Model-Use, else point.",
        "canonical_home": "yuri-origin.md L106/L128.",
        "footprint_removed": "CLAUDE L76 (134 ch/~34 tok) + the 'first-run hypothesis' clause of L114.",
        "estimated_saving": "~45 tok directly; conceptually un-muddies ~9 surface expressions (§2E)."
      },
      {
        "rank": 7,
        "action": "CLAUDE.md verification section L181-189: keep the adapter-specific checklist shape but delete the 'attack first-run success' line (duplicate of origin L165) and consolidate with L114 so verification is described once, not twice, in the adapter.",
        "canonical_home": "yuri-origin.md L165 (first-run-success) + origin Output Contract L31-36.",
        "footprint_removed": "partial of L181-189 (244 ch/~61 tok).",
        "estimated_saving": "~30 tok."
      },
      {
        "rank": 8,
        "action": "Consolidate the 4× xref-query/propagation-scan invocations inside CLAUDE.md (L18, L20, L51-57, L122) into ONE canonical 'Navigation' block (the L48-60 bash block) + one inline reminder.",
        "canonical_home": "CLAUDE.md internal (single block).",
        "estimated_saving": "~60-80 tok + reduced internal contradiction risk."
      },
      {
        "rank": 9,
        "action": "GitNexus block L191-197: leave as-is OR (better) let the managed block stay SHORT (dispatcher pointer only) and rely on yuri-origin L23-29 + the /gitnexus command. Since `gitnexus analyze` re-expands it, this is a tool-config change, not a hand-edit.",
        "canonical_home": "yuri-origin.md L23-29 + the skill deep-dives already linked.",
        "footprint_removed": "719 chars / ~180 tok if fully collapsed to a pointer.",
        "estimated_saving": "~140 tok — but flag this as tool-managed, so coordinate with the gitnexus block generator rather than hand-editing past the markers."
      }
    ],
    "total_estimated_saving_band": "Summing ranks 1-7 (the high-confidence hand-edits, excluding the tool-managed GitNexus block): roughly ~2,700-3,400 tok upper-bound removed from permanent context — a ~20-25% reduction of the ~14.5k always-loaded tax, with the bulk (~2,100 tok) from the single SOUL→persona merge (Proposal 1). The GitNexus block (Proposal 9, ~140 tok) is bonus if the generator is reconfigured.",
    "priority_order": "Proposal 1 (SOUL merge) dwarfs everything else combined — it alone is ~60-75% of the recoverable budget. Do it first; it also resolves §2A + §2F + half of §2E in one cut."
  },
  "residual_risks_and_notes": [
    "SOUL.md merge risk: ~6 SOUL lines have no clean persona counterpart (L17 resourceful, L19/L21 durability, L31 testable-machinery, L61 resolve-ambiguity, L65/L67 trust/guest). Verify none is load-bearing before deleting — recommend folding the unique ones into persona as 1-line additions, not losing them. [CONFIRMED: 6 deferral pointers + 2 verbatim dupes; the unique-residue set is my inference from comparison, re-check before merge.]",
    "CLAUDE.md protected-paths pointer (Proposal 5) introduces a one-hop indirection for a safety-critical list. Trade-off: it removes staleness but adds a read step. Acceptable because origin is always-loaded too, but flag that the adapter must never diverge if it keeps any inline list.",
    "The GitNexus block is auto-managed by `npx gitnexus analyze` — hand-editing inside the markers will be overwritten. Proposal 9 requires changing the generator/config, not the file.",
    "Token figures are heuristic (chars/4 upper, words/0.75 lower); real Claude tokenization of this dense symbol-heavy markdown likely lands near the upper bound, so savings are probably conservative. To get exact numbers, install tiktoken or use the model's own tokenizer."
  ],
  "files_changed_by_this_audit": "None — this is an analysis deliverable only. No files were modified."
}